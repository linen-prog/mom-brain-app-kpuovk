import { describe, test, expect } from "bun:test";
import { api, authenticatedApi, signUpTestUser, expectStatus, connectWebSocket, connectAuthenticatedWebSocket, waitForMessage, createTestFile, createTestAudioFile } from "./helpers";

describe("API Integration Tests", () => {
  // Shared state for chaining tests (e.g., created resource IDs, auth tokens)
  // let authToken: string;
  // let resourceId: string;

  describe("POST /api/organize", () => {
    test("Organize brain dump with valid text", async () => {
      // Add initial delay to allow server to start up
      await new Promise(resolve => setTimeout(resolve, 2000));

      const res = await api("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Buy milk, schedule dentist appointment, fix the kitchen sink, plan weekly menu, call mom",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();

      // Verify response structure includes all required categories
      expect(data).toHaveProperty("doToday");
      expect(data).toHaveProperty("thisWeek");
      expect(data).toHaveProperty("kids");
      expect(data).toHaveProperty("home");
      expect(data).toHaveProperty("errands");
      expect(data).toHaveProperty("meals");
      expect(data).toHaveProperty("messages");
      expect(data).toHaveProperty("holdingForLater");
      expect(data).toHaveProperty("momCheckIn");

      // Verify categories are arrays (except momCheckIn which is a string)
      expect(Array.isArray(data.doToday)).toBe(true);
      expect(Array.isArray(data.thisWeek)).toBe(true);
      expect(Array.isArray(data.kids)).toBe(true);
      expect(Array.isArray(data.home)).toBe(true);
      expect(Array.isArray(data.errands)).toBe(true);
      expect(Array.isArray(data.meals)).toBe(true);
      expect(Array.isArray(data.messages)).toBe(true);
      expect(Array.isArray(data.holdingForLater)).toBe(true);
      expect(typeof data.momCheckIn).toBe("string");
    });

    test("Organize brain dump with longer text", async () => {
      // Add longer delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 5000));

      const res = await api("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Finish project report today, review budget this week, help kids with homework, repair fence, go grocery shopping, prepare dinner, respond to emails, save article on productivity",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.doToday).toBeDefined();
      expect(data.thisWeek).toBeDefined();
    });

    test("Organize brain dump with minimal text", async () => {
      // Add longer delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 5000));

      const res = await api("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Call mom",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("doToday");
      expect(data).toHaveProperty("momCheckIn");
    });

    test("Reject request with missing text field", async () => {
      const res = await api("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with empty text", async () => {
      const res = await api("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with null text", async () => {
      const res = await api("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: null }),
      });
      await expectStatus(res, 400);
    });

    test("Reject request with whitespace-only text", async () => {
      const res = await api("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "   \n\t  " }),
      });
      await expectStatus(res, 400);
    });
  });

  describe("POST /api/transcribe", () => {
    test("Transcribe valid audio file", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 5000));

      const form = new FormData();
      form.append("audio", createTestAudioFile("test.wav", 500));

      const res = await api("/api/transcribe", {
        method: "POST",
        body: form,
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("text");
      expect(typeof data.text).toBe("string");
    });

    test("Reject request with missing audio file", async () => {
      const form = new FormData();

      const res = await api("/api/transcribe", {
        method: "POST",
        body: form,
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with empty audio file", async () => {
      const form = new FormData();
      form.append("audio", new File([], "empty.wav", { type: "audio/wav" }));

      const res = await api("/api/transcribe", {
        method: "POST",
        body: form,
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });
  });
});
