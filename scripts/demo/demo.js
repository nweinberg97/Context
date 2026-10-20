/*
 * Static-demo behaviour for the GitHub Pages build. The real app does all of this on
 * the server; here it is faked in the browser so the flow can be clicked through.
 * Nothing is stored or sent anywhere.
 */
(function () {
  var page = document.body.getAttribute("data-demo-page");
  var EXAMPLE =
    "Hi Jordan,\n\nGreat work today. Do the chin tucks, 2 x 10, every morning. Your posture is already better.\n" +
    "Try the doorway stretch before bed. Keep working on your breathing exercises.\n\nWalk for 20 minutes after lunch.\n\nSee you on the 24th,\nMarina";

  // Forms: never submit; move to the next screen of the story instead.
  var NEXT = { "sign-up": "import.html", "sign-in": "today.html", import: "review.html", review: "today.html" };
  document.addEventListener(
    "submit",
    function (e) {
      e.preventDefault();
      var form = e.target;
      if (page === "review" && !form.querySelector("#routine-title")) return; // per-card forms
      if (NEXT[page]) window.location.href = NEXT[page];
    },
    true,
  );

  // Add advice: start with an example message so the button is ready to press.
  if (page === "import") {
    var text = document.getElementById("text");
    var submit = document.querySelector('button[type="submit"]');
    var count = document.getElementById("text-count");
    if (text && !text.value) {
      text.value = EXAMPLE;
      if (count) count.textContent = EXAMPLE.length.toLocaleString() + " / 12,000 characters";
    }
    if (submit) submit.disabled = false;
    if (text)
      text.addEventListener("input", function () {
        if (count) count.textContent = text.value.length.toLocaleString() + " / 12,000 characters";
        if (submit) submit.disabled = text.value.trim().length === 0 || text.value.length > 12000;
      });
  }

  // Review: Approve / Not a habit update the card and the save button.
  if (page === "review") {
    var save = Array.prototype.find.call(document.querySelectorAll('button[type="submit"]'), function (b) {
      return /Save routine/.test(b.textContent || "");
    });
    var note = save && save.closest("form") ? save.closest("form").querySelector('p[aria-live="polite"]') : null;
    function refresh() {
      var cards = document.querySelectorAll("article");
      var approved = 0;
      var waiting = 0;
      cards.forEach(function (c) {
        if (c.getAttribute("data-demo-state") === "approved") approved++;
        else if (c.getAttribute("data-demo-state") !== "left-out") waiting++;
      });
      if (save) {
        save.disabled = approved === 0;
        save.textContent = approved ? "Save routine · " + approved + " habit" + (approved === 1 ? "" : "s") : "Save routine";
      }
      if (note)
        note.textContent =
          approved === 0
            ? "Approve at least one habit to save."
            : waiting
              ? waiting + " suggestion" + (waiting === 1 ? " is" : "s are") + " still waiting. Saving leaves " + (waiting === 1 ? "it" : "them") + " out."
              : "Everything’s reviewed.";
    }
    document.querySelectorAll("article").forEach(function (card) {
      var badge = card.querySelector("span.rounded-full");
      card.querySelectorAll("button").forEach(function (btn) {
        var label = (btn.textContent || "").trim();
        if (/^Approve/.test(label) || /^Not a habit|^Leave out/.test(label)) {
          btn.type = "button";
          btn.addEventListener("click", function () {
            var approve = /^Approve/.test(label);
            card.setAttribute("data-demo-state", approve ? "approved" : "left-out");
            card.style.outline = approve ? "2px solid #2e6bff" : "";
            card.style.opacity = approve ? "" : "0.55";
            if (badge) badge.textContent = approve ? "Approved" : "Left out";
            refresh();
          });
        }
      });
    });
    refresh();
  }

  // Today: completion buttons toggle like the real app (press again to clear).
  var SELECTED = { Done: ["bg-ink", "text-paper"], Partly: ["bg-mark", "text-forest"], Skipped: ["bg-sage-2", "text-forest"] };
  document.querySelectorAll('[role="group"] button[aria-pressed]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      var group = btn.closest('[role="group"]');
      var wasOn = btn.getAttribute("aria-pressed") === "true";
      group.querySelectorAll("button[aria-pressed]").forEach(function (b) {
        var key = (b.textContent || "").trim();
        b.setAttribute("aria-pressed", "false");
        (SELECTED[key] || []).forEach(function (c) { b.classList.remove(c); });
        b.classList.add("text-muted");
      });
      if (!wasOn) {
        var key = (btn.textContent || "").trim();
        btn.setAttribute("aria-pressed", "true");
        btn.classList.remove("text-muted");
        (SELECTED[key] || []).forEach(function (c) { btn.classList.add(c); });
      }
    });
  });

  // Buttons that would need a server explain themselves instead of doing nothing.
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button");
    if (!btn || btn.closest('[role="group"]') || btn.type === "submit" || btn.getAttribute("data-demo-ok")) return;
    var label = (btn.textContent || "").trim();
    if (/^(Approve|Not a habit|Leave out|Print this page)/.test(label)) return;
    if (btn.closest("article") || btn.closest("li") || btn.closest("section")) {
      var toast = document.getElementById("demo-toast");
      if (!toast) return;
      toast.textContent = "That works in the full app. This demo doesn’t save changes.";
      toast.hidden = false;
      clearTimeout(window.__demoToast);
      window.__demoToast = setTimeout(function () { toast.hidden = true; }, 2600);
    }
  });
})();
