import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "yaml";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const workflowsDir = resolve(__dirname, "../workflows");

function loadWorkflow(filename: string): Record<string, unknown> {
  const raw = readFileSync(resolve(workflowsDir, filename), "utf-8");
  return parse(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// claude-code-review.yml
// ---------------------------------------------------------------------------

describe("claude-code-review.yml", () => {
  const wf = loadWorkflow("claude-code-review.yml");

  it("has the correct workflow name", () => {
    expect(wf.name).toBe("Claude Code Review");
  });

  describe("triggers (on:)", () => {
    const on = wf.on as Record<string, unknown>;

    it("triggers only on pull_request events", () => {
      expect(Object.keys(on)).toEqual(["pull_request"]);
    });

    it("triggers on pull_request opened", () => {
      const pr = on.pull_request as { types: string[] };
      expect(pr.types).toContain("opened");
    });

    it("triggers on pull_request synchronize", () => {
      const pr = on.pull_request as { types: string[] };
      expect(pr.types).toContain("synchronize");
    });

    it("triggers on pull_request ready_for_review", () => {
      const pr = on.pull_request as { types: string[] };
      expect(pr.types).toContain("ready_for_review");
    });

    it("triggers on pull_request reopened", () => {
      const pr = on.pull_request as { types: string[] };
      expect(pr.types).toContain("reopened");
    });

    it("does NOT trigger on pull_request closed", () => {
      const pr = on.pull_request as { types: string[] };
      expect(pr.types).not.toContain("closed");
    });
  });

  describe("job: claude-review", () => {
    const jobs = wf.jobs as Record<string, unknown>;
    const job = jobs["claude-review"] as Record<string, unknown>;

    it("defines the claude-review job", () => {
      expect(job).toBeDefined();
    });

    it("runs on ubuntu-latest", () => {
      expect(job["runs-on"]).toBe("ubuntu-latest");
    });

    it("has no job-level if condition (runs for all matching PRs)", () => {
      expect(job["if"]).toBeUndefined();
    });

    describe("permissions", () => {
      const permissions = job.permissions as Record<string, string>;

      it("grants contents: read", () => {
        expect(permissions.contents).toBe("read");
      });

      it("grants pull-requests: read", () => {
        expect(permissions["pull-requests"]).toBe("read");
      });

      it("grants issues: read", () => {
        expect(permissions.issues).toBe("read");
      });

      it("grants id-token: write", () => {
        expect(permissions["id-token"]).toBe("write");
      });

      it("does not grant write access to contents", () => {
        expect(permissions.contents).not.toBe("write");
      });

      it("does not grant write access to pull-requests", () => {
        expect(permissions["pull-requests"]).not.toBe("write");
      });
    });

    describe("steps", () => {
      const steps = job.steps as Array<Record<string, unknown>>;

      it("has exactly two steps", () => {
        expect(steps).toHaveLength(2);
      });

      describe("step 1: Checkout repository", () => {
        const step = steps[0];

        it("is named 'Checkout repository'", () => {
          expect(step.name).toBe("Checkout repository");
        });

        it("uses actions/checkout@v4", () => {
          expect(step.uses).toBe("actions/checkout@v4");
        });

        it("sets fetch-depth to 1 (shallow clone)", () => {
          const withInputs = step.with as Record<string, unknown>;
          expect(withInputs["fetch-depth"]).toBe(1);
        });
      });

      describe("step 2: Run Claude Code Review", () => {
        const step = steps[1];
        const withInputs = step.with as Record<string, string>;

        it("is named 'Run Claude Code Review'", () => {
          expect(step.name).toBe("Run Claude Code Review");
        });

        it("has id 'claude-review'", () => {
          expect(step.id).toBe("claude-review");
        });

        it("uses anthropics/claude-code-action@v1", () => {
          expect(step.uses).toBe("anthropics/claude-code-action@v1");
        });

        it("passes claude_code_oauth_token from secrets", () => {
          expect(withInputs.claude_code_oauth_token).toContain(
            "secrets.CLAUDE_CODE_OAUTH_TOKEN",
          );
        });

        it("specifies plugin_marketplaces pointing to anthropics/claude-code", () => {
          expect(withInputs.plugin_marketplaces).toContain(
            "github.com/anthropics/claude-code.git",
          );
        });

        it("specifies the code-review plugin", () => {
          expect(withInputs.plugins).toBe("code-review@claude-code-plugins");
        });

        it("includes the /code-review:code-review command in prompt", () => {
          expect(withInputs.prompt).toContain("/code-review:code-review");
        });

        it("references github.repository in the prompt", () => {
          expect(withInputs.prompt).toContain("github.repository");
        });

        it("references github.event.pull_request.number in the prompt", () => {
          expect(withInputs.prompt).toContain(
            "github.event.pull_request.number",
          );
        });

        it("constructs a pull request URL pattern in the prompt", () => {
          // prompt should be: /code-review:code-review ${{ github.repository }}/pull/${{ ... }}
          expect(withInputs.prompt).toMatch(/github\.repository.*\/pull\//);
        });
      });
    });
  });
});

// ---------------------------------------------------------------------------
// claude.yml
// ---------------------------------------------------------------------------

describe("claude.yml", () => {
  const wf = loadWorkflow("claude.yml");

  it("has the correct workflow name", () => {
    expect(wf.name).toBe("Claude Code");
  });

  describe("triggers (on:)", () => {
    const on = wf.on as Record<string, unknown>;

    it("triggers on issue_comment", () => {
      expect(on).toHaveProperty("issue_comment");
    });

    it("triggers on pull_request_review_comment", () => {
      expect(on).toHaveProperty("pull_request_review_comment");
    });

    it("triggers on issues", () => {
      expect(on).toHaveProperty("issues");
    });

    it("triggers on pull_request_review", () => {
      expect(on).toHaveProperty("pull_request_review");
    });

    it("does NOT trigger directly on pull_request (push/sync events)", () => {
      expect(on).not.toHaveProperty("pull_request");
    });

    it("does NOT trigger on push", () => {
      expect(on).not.toHaveProperty("push");
    });

    it("triggers issue_comment on created type only", () => {
      const ic = on.issue_comment as { types: string[] };
      expect(ic.types).toEqual(["created"]);
    });

    it("triggers pull_request_review_comment on created type only", () => {
      const prc = on.pull_request_review_comment as { types: string[] };
      expect(prc.types).toEqual(["created"]);
    });

    it("triggers issues on opened type", () => {
      const issues = on.issues as { types: string[] };
      expect(issues.types).toContain("opened");
    });

    it("triggers issues on assigned type", () => {
      const issues = on.issues as { types: string[] };
      expect(issues.types).toContain("assigned");
    });

    it("triggers pull_request_review on submitted type only", () => {
      const prr = on.pull_request_review as { types: string[] };
      expect(prr.types).toEqual(["submitted"]);
    });
  });

  describe("job: claude", () => {
    const jobs = wf.jobs as Record<string, unknown>;
    const job = jobs["claude"] as Record<string, unknown>;

    it("defines the claude job", () => {
      expect(job).toBeDefined();
    });

    it("runs on ubuntu-latest", () => {
      expect(job["runs-on"]).toBe("ubuntu-latest");
    });

    describe("job-level if condition", () => {
      const condition = job["if"] as string;

      it("has a job-level if condition", () => {
        expect(condition).toBeDefined();
      });

      it("activates for issue_comment events that mention @claude", () => {
        expect(condition).toContain("github.event_name == 'issue_comment'");
        expect(condition).toContain("github.event.comment.body");
        expect(condition).toContain("'@claude'");
      });

      it("activates for pull_request_review_comment events that mention @claude", () => {
        expect(condition).toContain(
          "github.event_name == 'pull_request_review_comment'",
        );
        // review comments share the same comment.body path
        expect(condition).toContain("github.event.comment.body");
      });

      it("activates for pull_request_review events where review body mentions @claude", () => {
        expect(condition).toContain(
          "github.event_name == 'pull_request_review'",
        );
        expect(condition).toContain("github.event.review.body");
      });

      it("activates for issues events when @claude appears in the issue body", () => {
        expect(condition).toContain("github.event_name == 'issues'");
        expect(condition).toContain("github.event.issue.body");
      });

      it("activates for issues events when @claude appears in the issue title", () => {
        expect(condition).toContain("github.event_name == 'issues'");
        expect(condition).toContain("github.event.issue.title");
      });

      it("uses contains() to check for @claude in all conditions", () => {
        const mentionCount = (condition.match(/contains\(/g) ?? []).length;
        // There are 5 contains() calls: comment.body (x2), review.body, issue.body, issue.title
        expect(mentionCount).toBeGreaterThanOrEqual(4);
      });

      it("checks issue title OR issue body (uses || within issues branch)", () => {
        // The issues branch should use OR logic: body OR title
        expect(condition).toMatch(
          /github\.event\.issue\.body.*\|\|.*github\.event\.issue\.title|github\.event\.issue\.title.*\|\|.*github\.event\.issue\.body/,
        );
      });

      it("does not unconditionally activate for all events", () => {
        // Condition must not be just 'true'
        expect(condition.trim()).not.toBe("true");
      });
    });

    describe("permissions", () => {
      const permissions = job.permissions as Record<string, string>;

      it("grants contents: read", () => {
        expect(permissions.contents).toBe("read");
      });

      it("grants pull-requests: read", () => {
        expect(permissions["pull-requests"]).toBe("read");
      });

      it("grants issues: read", () => {
        expect(permissions.issues).toBe("read");
      });

      it("grants id-token: write", () => {
        expect(permissions["id-token"]).toBe("write");
      });

      it("grants actions: read (needed to read CI results)", () => {
        expect(permissions.actions).toBe("read");
      });

      it("does not grant write access to contents", () => {
        expect(permissions.contents).not.toBe("write");
      });

      it("does not grant admin access to any permission", () => {
        const values = Object.values(permissions);
        expect(values).not.toContain("admin");
      });
    });

    describe("steps", () => {
      const steps = job.steps as Array<Record<string, unknown>>;

      it("has exactly two steps", () => {
        expect(steps).toHaveLength(2);
      });

      describe("step 1: Checkout repository", () => {
        const step = steps[0];

        it("is named 'Checkout repository'", () => {
          expect(step.name).toBe("Checkout repository");
        });

        it("uses actions/checkout@v4", () => {
          expect(step.uses).toBe("actions/checkout@v4");
        });

        it("sets fetch-depth to 1 (shallow clone)", () => {
          const withInputs = step.with as Record<string, unknown>;
          expect(withInputs["fetch-depth"]).toBe(1);
        });
      });

      describe("step 2: Run Claude Code", () => {
        const step = steps[1];
        const withInputs = step.with as Record<string, string>;

        it("is named 'Run Claude Code'", () => {
          expect(step.name).toBe("Run Claude Code");
        });

        it("has id 'claude'", () => {
          expect(step.id).toBe("claude");
        });

        it("uses anthropics/claude-code-action@v1", () => {
          expect(step.uses).toBe("anthropics/claude-code-action@v1");
        });

        it("passes claude_code_oauth_token from secrets", () => {
          expect(withInputs.claude_code_oauth_token).toContain(
            "secrets.CLAUDE_CODE_OAUTH_TOKEN",
          );
        });

        it("includes additional_permissions for reading actions", () => {
          expect(withInputs.additional_permissions).toBeDefined();
          expect(withInputs.additional_permissions).toContain("actions");
          expect(withInputs.additional_permissions).toContain("read");
        });

        it("does not set a hardcoded prompt (allows comment-driven instructions)", () => {
          // If prompt is set, Claude ignores the comment. It should not be set
          // so that Claude performs the instructions from the comment.
          expect(withInputs.prompt).toBeUndefined();
        });
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-workflow consistency checks
// ---------------------------------------------------------------------------

describe("workflow consistency across both files", () => {
  const review = loadWorkflow("claude-code-review.yml");
  const claude = loadWorkflow("claude.yml");

  it("both workflows use the same checkout action version (actions/checkout@v4)", () => {
    const reviewCheckout = (
      (review.jobs as Record<string, unknown>)["claude-review"] as Record<
        string,
        unknown
      >
    ).steps as Array<Record<string, unknown>>;
    const claudeCheckout = (
      (claude.jobs as Record<string, unknown>)["claude"] as Record<
        string,
        unknown
      >
    ).steps as Array<Record<string, unknown>>;

    expect(reviewCheckout[0].uses).toBe("actions/checkout@v4");
    expect(claudeCheckout[0].uses).toBe("actions/checkout@v4");
  });

  it("both workflows use the same Claude Code action version (anthropics/claude-code-action@v1)", () => {
    const reviewSteps = (
      (review.jobs as Record<string, unknown>)["claude-review"] as Record<
        string,
        unknown
      >
    ).steps as Array<Record<string, unknown>>;
    const claudeSteps = (
      (claude.jobs as Record<string, unknown>)["claude"] as Record<
        string,
        unknown
      >
    ).steps as Array<Record<string, unknown>>;

    expect(reviewSteps[1].uses).toBe("anthropics/claude-code-action@v1");
    expect(claudeSteps[1].uses).toBe("anthropics/claude-code-action@v1");
  });

  it("both workflows run on ubuntu-latest", () => {
    const reviewJob = (review.jobs as Record<string, unknown>)[
      "claude-review"
    ] as Record<string, unknown>;
    const claudeJob = (claude.jobs as Record<string, unknown>)[
      "claude"
    ] as Record<string, unknown>;

    expect(reviewJob["runs-on"]).toBe("ubuntu-latest");
    expect(claudeJob["runs-on"]).toBe("ubuntu-latest");
  });

  it("both workflows authenticate using CLAUDE_CODE_OAUTH_TOKEN secret", () => {
    const reviewStep = (
      (
        (review.jobs as Record<string, unknown>)["claude-review"] as Record<
          string,
          unknown
        >
      ).steps as Array<Record<string, unknown>>
    )[1];
    const claudeStep = (
      (
        (claude.jobs as Record<string, unknown>)["claude"] as Record<
          string,
          unknown
        >
      ).steps as Array<Record<string, unknown>>
    )[1];

    const reviewWith = reviewStep.with as Record<string, string>;
    const claudeWith = claudeStep.with as Record<string, string>;

    expect(reviewWith.claude_code_oauth_token).toContain(
      "CLAUDE_CODE_OAUTH_TOKEN",
    );
    expect(claudeWith.claude_code_oauth_token).toContain(
      "CLAUDE_CODE_OAUTH_TOKEN",
    );
  });

  it("both workflows use shallow clone (fetch-depth: 1)", () => {
    const reviewCheckoutWith = (
      (
        (review.jobs as Record<string, unknown>)["claude-review"] as Record<
          string,
          unknown
        >
      ).steps as Array<Record<string, unknown>>
    )[0].with as Record<string, unknown>;

    const claudeCheckoutWith = (
      (
        (claude.jobs as Record<string, unknown>)["claude"] as Record<
          string,
          unknown
        >
      ).steps as Array<Record<string, unknown>>
    )[0].with as Record<string, unknown>;

    expect(reviewCheckoutWith["fetch-depth"]).toBe(1);
    expect(claudeCheckoutWith["fetch-depth"]).toBe(1);
  });

  it("both workflows grant id-token: write permission", () => {
    const reviewPerms = (
      (review.jobs as Record<string, unknown>)["claude-review"] as Record<
        string,
        unknown
      >
    ).permissions as Record<string, string>;
    const claudePerms = (
      (claude.jobs as Record<string, unknown>)["claude"] as Record<
        string,
        unknown
      >
    ).permissions as Record<string, string>;

    expect(reviewPerms["id-token"]).toBe("write");
    expect(claudePerms["id-token"]).toBe("write");
  });
});