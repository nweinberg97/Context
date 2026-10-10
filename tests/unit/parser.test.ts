import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PARSE_LIMITS,
  ParseError,
  buildParsedInput,
  fingerprintContent,
  parseSelectedText,
  parsedInputSchema,
} from "../../src/lib/parser";
import { htmlToText } from "../../src/lib/parser/html";

const USER = "aaaaaaaa-0000-4000-8000-000000000001";
const SOURCE = "aaaaaaaa-1111-4000-8000-000000000001";

describe("parser", () => {
  it("keeps a simple plain-text email intact", () => {
    const out = parseSelectedText("Hi Sam,\n\nTry the mobility exercise before work. Review your notes each evening.\n");
    assert.match(out.body, /Try the mobility exercise before work\./);
    assert.match(out.body, /Review your notes each evening\./);
    assert.equal(out.fingerprint.length, 64);
  });

  it("removes quoted reply history when there is real content above it", () => {
    const raw = [
      "Great question. Do the wall angels 3 x 8 every morning.",
      "",
      "On Tue, Oct 6, 2026 at 9:14 AM Jordan <jordan@example.com> wrote:",
      "> Should I keep doing the chin tucks?",
      "> Thanks!",
    ].join("\n");
    const out = parseSelectedText(raw);
    assert.equal(out.body, "Great question. Do the wall angels 3 x 8 every morning.");
    assert.ok(out.flags.includes("quoted_history_removed"));
    assert.doesNotMatch(out.body, /chin tucks/);
  });

  it("keeps quoted text when everything is quoted (the advice is probably in the quote)", () => {
    const out = parseSelectedText("> Walk for 20 minutes after dinner.\n> Stretch daily.");
    assert.match(out.body, /^Walk for 20 minutes after dinner\./);
    assert.ok(out.flags.includes("quoted_history_kept"));
  });

  it("strips Outlook-style original message blocks", () => {
    const out = parseSelectedText("Keep icing twice a day.\n\n-----Original Message-----\nFrom: Me\nSent: Monday\nHow often?");
    assert.equal(out.body, "Keep icing twice a day.");
  });

  it("strips signatures after an RFC 3676 delimiter", () => {
    const out = parseSelectedText("Read one chapter each night.\n-- \nMarina Chen, PT\nNorthside Physio\n604-555-0100");
    assert.equal(out.body, "Read one chapter each night.");
    assert.ok(out.flags.includes("signature_removed"));
  });

  it("strips a sign-off block and mobile footer", () => {
    const out = parseSelectedText("Practise scales for 10 minutes daily.\n\nBest,\nAlex\nPiano teacher\n\nSent from my iPhone");
    assert.equal(out.body, "Practise scales for 10 minutes daily.");
    assert.ok(out.flags.includes("signature_removed"));
    assert.ok(out.flags.includes("mobile_footer_removed"));
  });

  it("does not treat advice that ends a message as a signature", () => {
    const out = parseSelectedText("Stretch your calves after every run.\nTake care");
    // "Take care" with nothing after it is a sign-off; the instruction above survives.
    assert.equal(out.body, "Stretch your calves after every run.");
  });

  it("removes leading email headers and uses the subject as a title", () => {
    const raw = "From: Marina Chen <marina@example.com>\nTo: Jordan\nSubject: Re: Your home program\nDate: Oct 6\n\nChin tucks, 2 x 10, twice a day.";
    const out = parseSelectedText(raw);
    assert.equal(out.body, "Chin tucks, 2 x 10, twice a day.");
    assert.equal(out.title, "Your home program");
    assert.ok(out.flags.includes("headers_removed"));
  });

  it("removes forwarded-message headers but keeps the forwarded advice", () => {
    const raw = "FYI\n\n---------- Forwarded message ---------\nFrom: Coach Lee <lee@example.com>\nDate: Mon, Oct 5\nSubject: Week 3\nTo: me\n\nRun 3 times a week, easy pace.";
    const out = parseSelectedText(raw);
    assert.match(out.body, /Run 3 times a week, easy pace\./);
    assert.doesNotMatch(out.body, /From:/);
    assert.equal(out.title, "Week 3");
  });

  it("converts HTML content to text without keeping markup or scripts", () => {
    const html = `<html><head><style>p{color:red}</style><script>alert(1)</script></head>
      <body><div>Hi Jordan,</div><p>Do <b>chin tucks</b> &amp; wall angels before work.</p>
      <ul><li>Hold 30&nbsp;seconds</li><li>Rest</li></ul>
      <div class="gmail_quote">On Mon wrote:<blockquote>old stuff</blockquote></div></body></html>`;
    const out = parseSelectedText(html);
    assert.ok(out.flags.includes("html_converted"));
    assert.match(out.body, /Do chin tucks & wall angels before work\./);
    assert.match(out.body, /- Hold 30 seconds/);
    assert.doesNotMatch(out.body, /alert|color:red|<|old stuff/);
  });

  it("prefixes blockquote content so quoted HTML is treated as quoted", () => {
    assert.match(htmlToText("<p>New</p><blockquote><p>Old</p></blockquote>"), /^> Old$/m);
  });

  it("rejects an empty body", () => {
    assert.throws(() => parseSelectedText("   \n\n  "), (e: unknown) => e instanceof ParseError && e.category === "empty");
    assert.throws(() => parseSelectedText("<div></div><p> </p>"), (e: unknown) => e instanceof ParseError && e.category === "empty");
  });

  it("rejects oversized input", () => {
    const big = "Walk daily. ".repeat(Math.ceil((PARSE_LIMITS.maxBodyChars + 10) / 12));
    assert.throws(() => parseSelectedText(big), (e: unknown) => e instanceof ParseError && e.category === "too_large");
    assert.throws(() => parseSelectedText("x".repeat(PARSE_LIMITS.maxRawChars + 1)), (e: unknown) => e instanceof ParseError && e.category === "too_large");
  });

  it("rejects malformed (binary) input", () => {
    assert.throws(() => parseSelectedText("\u0000\u0000\u0000abc\u0000\u0000"), (e: unknown) => e instanceof ParseError && e.category === "unparseable");
    assert.throws(() => parseSelectedText(42 as unknown as string), ParseError);
  });

  it("normalises unicode and unusual whitespace", () => {
    const raw = "Stretch\u00A0daily\u200B.\r\n\r\n\r\n\r\nWalk\u2003after\tlunch.\u2028Breathe\u3000slowly.";
    const out = parseSelectedText(raw);
    assert.equal(out.body, "Stretch daily.\n\nWalk after lunch.\nBreathe slowly.");
    assert.equal(parseSelectedText("Cafe\u0301 visit daily").body, "Caf\u00E9 visit daily");
  });

  it("fingerprints are stable across whitespace and case differences", () => {
    assert.equal(fingerprintContent("Walk  daily.\n"), fingerprintContent("walk daily."));
    assert.notEqual(fingerprintContent("Walk daily."), fingerprintContent("Walk weekly."));
  });

  it("builds a versioned parsed input whose trusted metadata comes only from the server", () => {
    const parsed = parseSelectedText("Walk daily.");
    const input = buildParsedInput({ sourceId: SOURCE, userId: USER, sourceType: "paste", parsed });
    assert.equal(input.schemaVersion, 1);
    assert.equal(input.trusted.senderVerified, false);
    assert.deepEqual(input.scope, { selectedByUser: true, mailboxAccess: false });
    // Extra keys (e.g. a client trying to smuggle senderVerified: true) are rejected.
    assert.throws(() => parsedInputSchema.parse({ ...input, verified: true }));
    assert.throws(() => parsedInputSchema.parse({ ...input, scope: { selectedByUser: true, mailboxAccess: true } }));
  });
});
