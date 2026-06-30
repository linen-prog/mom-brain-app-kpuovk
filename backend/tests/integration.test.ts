import { describe, test, expect } from "bun:test";
import { api, authenticatedApi, signUpTestUser, expectStatus, connectWebSocket, connectAuthenticatedWebSocket, waitForMessage, createTestFile, createTestAudioFile } from "./helpers";

describe("API Integration Tests", () => {
  // Shared state for chaining tests (e.g., created resource IDs, auth tokens)
  // let authToken: string;
  // let resourceId: string;

  describe("POST /api/organize", () => {
    test("Organize brain dump with valid text", async () => {
      // Add initial delay to allow server to start up
      await new Promise(resolve => setTimeout(resolve, 3000));

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
      await new Promise(resolve => setTimeout(resolve, 10000));

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
      await new Promise(resolve => setTimeout(resolve, 10000));

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
      await new Promise(resolve => setTimeout(resolve, 10000));

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

    test("Reject request with file too large", async () => {
      const form = new FormData();
      // Create a file larger than 10MB limit (11MB)
      const largeBuffer = new Uint8Array(11 * 1024 * 1024);
      const largeFile = new File([largeBuffer], "large.wav", { type: "audio/wav" });
      form.append("audio", largeFile);

      const res = await api("/api/transcribe", {
        method: "POST",
        body: form,
      });
      await expectStatus(res, 413);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });
  });

  describe("POST /api/email-draft", () => {
    test("Generate email draft with required fields only", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "Check progress on math homework",
          context: "teacher",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("subject");
      expect(data).toHaveProperty("body");
      expect(data).toHaveProperty("recipientName");
      expect(typeof data.subject).toBe("string");
      expect(typeof data.body).toBe("string");
    });

    test("Generate email draft with all optional fields", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "Request meeting about upcoming school event",
          context: "other_parent",
          recipientName: "John Smith",
          childName: "Emma",
          additionalNotes: "Prefer afternoon meetings",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("subject");
      expect(data).toHaveProperty("body");
      expect(typeof data.subject).toBe("string");
      expect(typeof data.body).toBe("string");
    });

    test("Generate email draft with pediatrician context", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "Ask about vaccination schedule",
          context: "pediatrician",
          childName: "Sophie",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("subject");
      expect(data).toHaveProperty("body");
    });

    test("Generate email draft with work context", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "Request deadline extension for project",
          context: "work",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("subject");
      expect(data).toHaveProperty("body");
    });

    test("Generate email draft with activity context", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "Inquire about summer camp schedule",
          context: "activity",
          childName: "Lucas",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("subject");
      expect(data).toHaveProperty("body");
    });

    test("Generate email draft with admin context", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "Request school records update",
          context: "admin",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("subject");
      expect(data).toHaveProperty("body");
    });

    test("Reject request with missing taskText", async () => {
      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "teacher",
        }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with missing context", async () => {
      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "Check homework",
        }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with invalid context value", async () => {
      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "Check homework",
          context: "invalid_context",
        }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with empty taskText", async () => {
      const res = await api("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: "",
          context: "teacher",
        }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });
  });

  describe("POST /api/rhythm/recap", () => {
    test("Generate weekly recap with valid data", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/rhythm/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedTasks: ["Buy groceries", "Schedule dentist", "Fix fence"],
          pendingTasks: ["Call mom", "Review budget", "Plan menu"],
          trackingItems: [
            {
              id: "track-1",
              text: "Monitor project progress",
              dueDate: "2024-07-05",
              category: "work",
            },
            {
              id: "track-2",
              text: "Kid's activity signup",
              dueDate: null,
              category: "kids",
            },
          ],
          daysUntilSunday: 3,
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("doneThisWeek");
      expect(data).toHaveProperty("rollingOver");
      expect(data).toHaveProperty("comingUp");
      expect(data).toHaveProperty("momMessage");
      expect(data).toHaveProperty("weekLabel");
      expect(Array.isArray(data.doneThisWeek)).toBe(true);
      expect(Array.isArray(data.rollingOver)).toBe(true);
      expect(Array.isArray(data.comingUp)).toBe(true);
      expect(typeof data.momMessage).toBe("string");
      expect(typeof data.weekLabel).toBe("string");
    });

    test("Generate weekly recap with minimal data", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/rhythm/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedTasks: [],
          pendingTasks: [],
          trackingItems: [],
          daysUntilSunday: 1,
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data).toHaveProperty("doneThisWeek");
      expect(data).toHaveProperty("momMessage");
    });

    test("Generate weekly recap with complex tracking items", async () => {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 10000));

      const res = await api("/api/rhythm/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedTasks: [
            "Completed project milestone",
            "Kids finished art class",
            "Cleaned kitchen",
          ],
          pendingTasks: [
            "Finish annual review",
            "Plan summer camps",
            "Home repairs",
          ],
          trackingItems: [
            {
              id: "track-abc123",
              text: "Client followup",
              dueDate: "2024-07-10",
              category: "work",
            },
            {
              id: "track-xyz789",
              text: "Soccer equipment order",
              dueDate: "2024-07-08",
              category: "kids",
            },
            {
              id: "track-home456",
              text: "Bathroom renovation quote",
              dueDate: null,
              category: "home",
            },
          ],
          daysUntilSunday: 2,
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data.doneThisWeek)).toBe(true);
      expect(Array.isArray(data.comingUp)).toBe(true);
      expect(typeof data.weekLabel).toBe("string");
    });

    test("Reject request with missing completedTasks", async () => {
      const res = await api("/api/rhythm/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingTasks: [],
          trackingItems: [],
          daysUntilSunday: 1,
        }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with missing pendingTasks", async () => {
      const res = await api("/api/rhythm/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedTasks: [],
          trackingItems: [],
          daysUntilSunday: 1,
        }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with missing trackingItems", async () => {
      const res = await api("/api/rhythm/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedTasks: [],
          pendingTasks: [],
          daysUntilSunday: 1,
        }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    test("Reject request with missing daysUntilSunday", async () => {
      const res = await api("/api/rhythm/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedTasks: [],
          pendingTasks: [],
          trackingItems: [],
        }),
      });
      await expectStatus(res, 400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });
  });
});
