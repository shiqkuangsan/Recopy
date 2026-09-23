//! Opt-in synthetic benchmark. Never connects to the user's database.
use super::{
    models::{ContentType, NewClipboardItem},
    queries, test_pool,
};
use std::time::Instant;

#[tokio::test]
#[ignore = "synthetic performance baseline; run explicitly with --ignored --nocapture"]
async fn search_cost_baseline() {
    for (rows, repeats) in [(1_000, 16), (10_000, 16), (1_000, 256)] {
        let pool = test_pool().await;
        let text = "recopy 中文搜索 clipboard performance token ".repeat(repeats);
        let item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: text.clone(),
            rich_content: None,
            thumbnail: None,
            image_path: None,
            file_path: None,
            file_name: None,
            source_app: "synthetic".into(),
            source_app_name: "Synthetic".into(),
            content_size: text.len() as i64,
            content_hash: "benchmark".into(),
        };
        let start = Instant::now();
        for _ in 0..rows {
            queries::insert_item(&pool, &item).await.unwrap();
        }
        let insert_ms = start.elapsed().as_secs_f64() * 1000.0;
        // Recreate the retired index ONLY in this synthetic DB to measure its cost.
        sqlx::query("CREATE VIRTUAL TABLE clipboard_fts USING fts5(item_id UNINDEXED, plain_text, file_name, source_app_name, tokenize='trigram')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO clipboard_fts (item_id, plain_text, file_name, source_app_name) SELECT id, plain_text, file_name, source_app_name FROM clipboard_items")
            .execute(&pool).await.unwrap();
        // Exercise note ranking and favorites on a reproducible subset.
        sqlx::query("UPDATE clipboard_items SET note_title = '中文备注', is_favorited = 1 WHERE rowid % 10 = 0")
            .execute(&pool).await.unwrap();
        let cases = [
            ("rcp", false),
            ("中文", false),
            ("中文 rcp", false),
            ("missingneedle", false),
            ("中文备注", false),
            ("rcp", true),
        ];
        let mut baseline_ids = Vec::new();
        let mut timings = Vec::new();
        for (query, favorites) in cases {
            let first = queries::search_items(&pool, query, None, 50, favorites)
                .await
                .unwrap();
            baseline_ids.push(first.iter().map(|x| x.id.clone()).collect::<Vec<_>>());
            let mut ms = Vec::new();
            for _ in 0..7 {
                let start = Instant::now();
                let result = queries::search_items(&pool, query, None, 50, favorites)
                    .await
                    .unwrap();
                ms.push(start.elapsed().as_secs_f64() * 1000.0);
                assert_eq!(result.len(), first.len());
            }
            ms.sort_by(f64::total_cmp);
            timings.push(serde_json::json!({"query":query,"favorites":favorites,
                "returned":first.len(),"median_ms":ms[3],"max_ms":ms[6]}));
        }
        // MATCH cannot substitute for non-contiguous fuzzy LIKE: rcp matches recopy.
        let fts_hits: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM clipboard_fts WHERE clipboard_fts MATCH 'rcp'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(!baseline_ids[0].is_empty());
        assert_eq!(fts_hits, 0);
        // Measure just FTS rebuild work in rolled-back transactions, not a full insert A/B.
        let mut rebuild_ms = Vec::new();
        for _ in 0..5 {
            let mut tx = pool.begin().await.unwrap();
            sqlx::query("DELETE FROM clipboard_fts")
                .execute(&mut *tx)
                .await
                .unwrap();
            let start = Instant::now();
            sqlx::query("INSERT INTO clipboard_fts (item_id, plain_text, file_name, source_app_name) SELECT id, plain_text, file_name, source_app_name FROM clipboard_items")
                .execute(&mut *tx).await.unwrap();
            rebuild_ms.push(start.elapsed().as_secs_f64() * 1000.0);
            tx.rollback().await.unwrap();
        }
        rebuild_ms.sort_by(f64::total_cmp);
        let page_size: i64 = sqlx::query_scalar("PRAGMA page_size")
            .fetch_one(&pool)
            .await
            .unwrap();
        let before: i64 = sqlx::query_scalar("PRAGMA freelist_count")
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query("DROP TABLE clipboard_fts")
            .execute(&pool)
            .await
            .unwrap();
        let after: i64 = sqlx::query_scalar("PRAGMA freelist_count")
            .fetch_one(&pool)
            .await
            .unwrap();
        for (i, (query, favorites)) in cases.into_iter().enumerate() {
            let actual = queries::search_items(&pool, query, None, 50, favorites)
                .await
                .unwrap();
            assert_eq!(
                actual.into_iter().map(|x| x.id).collect::<Vec<_>>(),
                baseline_ids[i]
            );
        }
        println!(
            "SEARCH_BASELINE {}",
            serde_json::json!({"rows":rows,"body_bytes":text.len(),
            "actual_insert_without_fts_total_ms":insert_ms,"fts_rebuild_median_ms":rebuild_ms[2],
            "fts_reclaimed_pages_bytes":(after-before)*page_size,"searches":timings,
            "same_ordered_ids_without_fts":true,"fts_rcp_hits":fts_hits})
        );
        pool.close().await;
    }
}
