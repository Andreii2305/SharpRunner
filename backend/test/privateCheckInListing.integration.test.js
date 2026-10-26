const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { after, afterEach, before, beforeEach, describe, test } = require("node:test");

process.env.JWT_SECRET = "private-check-in-listing-test-secret";

const User = require("../src/models/User");
const privateCheckInReadService = require("../src/services/privateCheckInReadService");
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("../src/constants/policyVersions");

const originalFindUser = User.findByPk;
const originalList = privateCheckInReadService.listPrivateCheckIns;
let listHandler;
let server;
let baseUrl;

const actors = new Map([[51, "student"], [52, "student"], [41, "teacher"], [61, "admin"]]);
const activeActor = (id, role) => ({
  id, role, status: "active", tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});
const token = (id) => jwt.sign({ id, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "5m" });
const request = async (query = "", actorId = 51) => {
  const response = await fetch(`${baseUrl}/api/notifications/check-ins${query}`, {
    headers: actorId !== null ? { Authorization: `Bearer ${token(actorId)}` } : {},
  });
  return { response, payload: await response.json() };
};

describe("private check-in recipient listing route", () => {
  before(async () => {
    const app = require("../src/app");
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => {
    User.findByPk = async (id) => {
      const role = actors.get(Number(id));
      return role ? activeActor(Number(id), role) : null;
    };
    privateCheckInReadService.listPrivateCheckIns = (input) => listHandler(input);
  });

  afterEach(() => {
    User.findByPk = originalFindUser;
    privateCheckInReadService.listPrivateCheckIns = originalList;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test("uses authenticated recipient identity and pagination defaults", async () => {
    let received;
    const expected = { checkIns: [], page: 1, limit: 20, total: 0, totalPages: 1, unreadTotal: 0 };
    listHandler = async (input) => { received = input; return expected; };

    const result = await request();
    assert.equal(result.response.status, 200);
    assert.deepEqual(received, { studentId: 51, page: 1, limit: 20, offset: 0 });
    assert.deepEqual(result.payload, expected);
  });

  test("accepts strict scalar pagination and forwards its safe offset", async () => {
    let received;
    listHandler = async (input) => {
      received = input;
      return { checkIns: [], page: input.page, limit: input.limit, total: 0, totalPages: 1, unreadTotal: 0 };
    };
    const result = await request("?page=3&limit=25");
    assert.equal(result.response.status, 200);
    assert.deepEqual(received, { studentId: 51, page: 3, limit: 25, offset: 50 });
  });

  test("rejects malformed, repeated, unknown, excessive, and overflowing pagination", async () => {
    let calls = 0;
    listHandler = async () => { calls += 1; return {}; };
    for (const query of [
      "?page=0", "?page=-1", "?page=1.5", "?page=01", "?page=abc",
      "?limit=0", "?limit=101", "?limit=20&limit=21", "?page=1&page=2",
      "?unexpected=1", "?page=9007199254740991&limit=100",
    ]) {
      const result = await request(query);
      assert.equal(result.response.status, 400, query);
      assert.deepEqual(result.payload, { message: "Invalid pagination" }, query);
    }
    assert.equal(calls, 0);
  });

  test("requires authentication and the student role before listing", async () => {
    let calls = 0;
    listHandler = async () => { calls += 1; return {}; };
    assert.equal((await request("", null)).response.status, 401);
    assert.equal((await request("", 41)).response.status, 403);
    assert.equal((await request("", 61)).response.status, 403);
    assert.equal(calls, 0);
  });

  test("unexpected failures return a safe response without exposing private message text", async () => {
    const privateText = "A private check-in message";
    listHandler = async () => { throw new Error(privateText); };
    const originalConsoleError = console.error;
    const logs = [];
    console.error = (...values) => { logs.push(values.join(" ")); };
    try {
      const result = await request();
      assert.equal(result.response.status, 500);
      assert.deepEqual(result.payload, { message: "Server error" });
      assert.doesNotMatch(logs.join("\n"), new RegExp(privateText));
    } finally {
      console.error = originalConsoleError;
    }
  });
});
