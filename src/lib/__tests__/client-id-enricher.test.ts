/**
 * Sprint 7.7 Track D · client-id-enricher unit tests.
 */
import { describe, expect, it, vi } from "vitest"
import { enrichClientIdFromContext } from "../client-id-enricher"

function mockSupa(overrides: Record<string, any> = {}): any {
  const defaultEmpty = () => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        not: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    })),
  })
  return {
    from: vi.fn((table: string) => {
      if (overrides[table]) return overrides[table]
      return defaultEmpty()
    }),
  }
}

describe("enrichClientIdFromContext", () => {
  it("returns body source si initialClientId present", async () => {
    const supa = mockSupa()
    const r = await enrichClientIdFromContext(supa, "client-uuid-1", {})
    expect(r.client_id).toBe("client-uuid-1")
    expect(r.source).toBe("body")
    expect(r.attempted_lookups).toEqual([])
  })

  it("resolves via workflow_executions cuando FK match", async () => {
    const supa = mockSupa({
      workflow_executions: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { client_id: "from-workflow" }, error: null }),
          }),
        }),
      },
    })
    const r = await enrichClientIdFromContext(supa, null, {
      workflow_execution_id: "wf-exec-1",
    })
    expect(r.client_id).toBe("from-workflow")
    expect(r.source).toBe("workflow_execution")
    expect(r.attempted_lookups).toEqual(["workflow_executions"])
  })

  it("falls through a journey_executions cuando workflow doesn't match", async () => {
    const supa = mockSupa({
      journey_executions: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { client_id: "from-journey" }, error: null }),
          }),
        }),
      },
    })
    const r = await enrichClientIdFromContext(supa, null, {
      workflow_execution_id: "wf-1",
      journey_id: "journey-1",
    })
    expect(r.client_id).toBe("from-journey")
    expect(r.source).toBe("journey_execution")
    expect(r.attempted_lookups).toContain("workflow_executions")
    expect(r.attempted_lookups).toContain("journey_executions")
  })

  it("falls through a session_resume si task_id NO match", async () => {
    const supa = mockSupa({
      agent_invocations: {
        select: () => ({
          eq: () => ({
            not: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: { client_id: "from-session" }, error: null }),
              }),
            }),
          }),
        }),
      },
    })
    const r = await enrichClientIdFromContext(supa, null, {
      session_id: "msg_01XYZ",
    })
    expect(r.client_id).toBe("from-session")
    expect(r.source).toBe("session_resume")
  })

  it("returns none source cuando todos los lookups fallan", async () => {
    const supa = mockSupa()
    const r = await enrichClientIdFromContext(supa, null, {
      workflow_execution_id: "wf-1",
      journey_id: "journey-1",
      task_id: "task-1",
      session_id: "session-1",
    })
    expect(r.client_id).toBeNull()
    expect(r.source).toBe("none")
    expect(r.attempted_lookups.length).toBeGreaterThan(0)
  })

  it("never throws · swallows DB exceptions", async () => {
    const supa = {
      from: vi.fn(() => {
        throw new Error("connection lost")
      }),
    } as any
    const r = await enrichClientIdFromContext(supa, null, {
      workflow_execution_id: "wf-1",
    })
    expect(r.client_id).toBeNull()
  })

  it("returns body source con NO lookups si initialClientId empty string treated as no-id", async () => {
    const supa = mockSupa()
    const r = await enrichClientIdFromContext(supa, "", {})
    expect(r.client_id).toBeNull()
    expect(r.source).toBe("none")
  })
})
