use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Condvar, Mutex,
};

/// Atomic reservation prevents concurrent installers from creating duplicate sessions.
pub(super) struct HookRegistry<R>(Mutex<Option<Arc<HookSession<R>>>>);

impl<R> HookRegistry<R> {
    pub const fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub fn reserve(&self) -> (Arc<HookSession<R>>, bool) {
        let mut current = self.0.lock().unwrap();
        if let Some(session) = current.as_ref().filter(|session| !session.is_stopped()) {
            return (session.clone(), false);
        }
        let session = Arc::new(HookSession::new());
        *current = Some(session.clone());
        (session, true)
    }

    pub fn stop_current(&self) -> Option<R> {
        let mut current = self.0.lock().unwrap();
        current.take().and_then(|session| session.stop())
    }

    pub fn is_running(&self) -> bool {
        self.0
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|session| session.is_running())
    }
}

/// Resources belong to one installation attempt, never to a global native handle slot.
enum Phase<R> {
    Pending,
    Running(R),
    Stopped,
}

pub(super) struct HookSession<R> {
    phase: Mutex<Phase<R>>,
    ready: Condvar,
    cancelled: AtomicBool,
    pub ctrl: AtomicBool,
    pub shift: AtomicBool,
}

impl<R> HookSession<R> {
    pub fn new() -> Self {
        Self {
            phase: Mutex::new(Phase::Pending),
            ready: Condvar::new(),
            cancelled: AtomicBool::new(false),
            ctrl: AtomicBool::new(false),
            shift: AtomicBool::new(false),
        }
    }

    pub fn is_stopped(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn is_running(&self) -> bool {
        !self.is_stopped() && matches!(*self.phase.lock().unwrap(), Phase::Running(_))
    }

    /// On rejection the producer still owns the resources and must close them.
    pub fn publish(&self, resources: R) -> Result<(), R> {
        let mut phase = self.phase.lock().unwrap();
        if self.is_stopped() || !matches!(*phase, Phase::Pending) {
            return Err(resources);
        }
        *phase = Phase::Running(resources);
        self.ready.notify_all();
        Ok(())
    }

    /// Wait only outside registry/native/UI locks. Cancellation also wakes waiters.
    pub fn wait_ready(&self) -> bool {
        let mut phase = self.phase.lock().unwrap();
        while matches!(*phase, Phase::Pending) {
            phase = self.ready.wait(phase).unwrap();
        }
        !self.is_stopped() && matches!(*phase, Phase::Running(_))
    }

    /// Exactly one stop caller receives this session's native resources.
    pub fn stop(&self) -> Option<R> {
        self.cancelled.store(true, Ordering::SeqCst);
        let mut phase = self.phase.lock().unwrap();
        let previous = std::mem::replace(&mut *phase, Phase::Stopped);
        self.ready.notify_all();
        match previous {
            Phase::Running(resources) => Some(resources),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn concurrent_installers_share_one_pending_session_and_can_retry_after_stop() {
        let registry = Arc::new(HookRegistry::<u64>::new());
        let callers: Vec<_> = (0..8)
            .map(|_| {
                let registry = registry.clone();
                std::thread::spawn(move || registry.reserve())
            })
            .collect();
        let sessions: Vec<_> = callers
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect();
        assert_eq!(sessions.iter().filter(|(_, created)| *created).count(), 1);
        assert!(sessions
            .iter()
            .all(|(session, _)| Arc::ptr_eq(session, &sessions[0].0)));
        sessions[0].0.publish(1).unwrap();
        assert!(registry.is_running());
        let old = sessions[0].0.clone();
        assert_eq!(registry.stop_current(), Some(1));
        assert!(old.is_stopped());
        let (new, created) = registry.reserve();
        assert!(created);
        assert!(old.is_stopped());
        new.publish(1).unwrap();
        assert_eq!(old.stop(), None);
        assert!(registry.is_running());
        assert!(new.wait_ready());
    }

    #[test]
    fn publication_and_stop_race_never_leaks_or_double_closes_resource() {
        for _ in 0..100 {
            let session = Arc::new(HookSession::new());
            let publisher = session.clone();
            let worker = std::thread::spawn(move || publisher.publish(7).err());
            let stopped = session.stop();
            let rejected = worker.join().unwrap();
            assert_eq!(
                stopped.into_iter().chain(rejected).collect::<Vec<_>>(),
                vec![7]
            );
            assert!(session.stop().is_none());
        }
    }

    #[test]
    fn late_exit_of_old_session_cannot_close_new_session() {
        let old = HookSession::new();
        old.publish(101).unwrap();
        assert_eq!(old.stop(), Some(101));
        let new = HookSession::new();
        new.publish(101).unwrap(); // Native handles can be reused.
        assert_eq!(old.stop(), None);
        assert!(new.is_running());
        assert_eq!(new.stop(), Some(101));
    }

    #[test]
    fn cancelling_pending_session_rejects_late_resources_and_wakes_waiters() {
        let session = Arc::new(HookSession::new());
        let waiter = session.clone();
        let thread = std::thread::spawn(move || waiter.wait_ready());
        assert_eq!(session.stop(), None);
        assert_eq!(session.publish(42), Err(42));
        assert!(!thread.join().unwrap());
    }

    #[test]
    fn concurrent_stop_transfers_resources_exactly_once() {
        let session = Arc::new(HookSession::new());
        session.publish(42).unwrap();
        let threads: Vec<_> = (0..8)
            .map(|_| {
                let session = session.clone();
                std::thread::spawn(move || session.stop())
            })
            .collect();
        let closed = threads
            .into_iter()
            .filter_map(|thread| thread.join().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(closed, vec![42]);
        assert!(!session.wait_ready());
    }

    #[test]
    fn modifiers_are_local_and_duplicate_publication_keeps_first_owner() {
        let old = HookSession::new();
        old.ctrl.store(true, Ordering::SeqCst);
        old.shift.store(true, Ordering::SeqCst);
        old.publish(1).unwrap();
        assert_eq!(old.publish(2), Err(2));
        let new = HookSession::<i32>::new();
        assert!(!new.ctrl.load(Ordering::SeqCst));
        assert!(!new.shift.load(Ordering::SeqCst));
        assert_eq!(old.stop(), Some(1));
        assert!(old.is_stopped());
    }
}
