const PAGES = [
  {
    id: "overview",
    label: "Overview",
    note: "what this is",
    title: "A placeholder with buttons",
    body: "This is the make a demo page. The options on the left (and above, on a phone) are filler — they swap this copy so the shell feels like a real product with more than one screen.",
    chips: [
      ["c-orange", "static HTML"],
      ["c-purple", "no API"],
      ["c-cyan", "hash routes"],
    ],
  },
  {
    id: "features",
    label: "Features",
    note: "pretend list",
    title: "Features (filler)",
    body: "Imagine a checklist: one hero line, a few option cards, and a panel that updates when you pick one. Nothing here is wired to a backend. That is the point of a demo page.",
    chips: [
      ["c-green", "option cards"],
      ["c-orange", "live panel"],
      ["c-pink", "shareable #hash"],
    ],
  },
  {
    id: "pricing",
    label: "Pricing",
    note: "made-up tiers",
    title: "Pricing (also filler)",
    body: "Free forever, because there is nothing to buy. If this were a real product there would be a Free / Plus / Team grid here. Instead you get three chips and a paragraph.",
    chips: [
      ["c-cyan", "Free: $0"],
      ["c-purple", "Plus: $0"],
      ["c-orange", "Team: still $0"],
    ],
  },
  {
    id: "about",
    label: "About",
    note: "why it exists",
    title: "About this page",
    body: "Added so inaayat.xyz has a /make-a-demo/ route that literally says “make a demo.” Use it as a blank to copy when a new experiment needs a URL before it has a personality.",
    chips: [
      ["c-pink", "/make-a-demo/"],
      ["c-green", "Beep boop"],
    ],
  },
  {
    id: "contact",
    label: "Contact",
    note: "no inbox",
    title: "Contact (do not)",
    body: "There is no form and no mailbox on this page. If you meant to leave, the home link in the nav goes back to the tessellated Beep boop cards.",
    chips: [
      ["c-orange", "no form"],
      ["c-cyan", "← home"],
    ],
  },
];

const ids = new Set(PAGES.map((page) => page.id));

function pageFromHash(hash = "") {
  const id = String(hash).replace(/^#/, "");
  return PAGES.find((page) => page.id === id) || PAGES[0];
}

function renderOptions(activeId) {
  const nav = document.getElementById("options");
  nav.replaceChildren(
    ...PAGES.map((page) => {
      const btn = document.createElement("a");
      btn.className = "mad-option" + (page.id === activeId ? " is-active" : "");
      btn.href = `#${page.id}`;
      btn.dataset.page = page.id;
      const label = document.createElement("span");
      label.className = "mad-option-label";
      label.textContent = page.label;
      const note = document.createElement("span");
      note.className = "mad-option-note";
      note.textContent = page.note;
      btn.append(label, note);
      return btn;
    })
  );
}

function renderPanel(page) {
  const panel = document.getElementById("panel");
  const title = document.createElement("h2");
  title.textContent = page.title;
  const body = document.createElement("p");
  body.textContent = page.body;
  const chips = document.createElement("ul");
  chips.className = "mad-chips";
  chips.append(
    ...page.chips.map(([tone, text]) => {
      const li = document.createElement("li");
      li.className = tone;
      li.textContent = text;
      return li;
    })
  );
  panel.replaceChildren(title, body, chips);
}

function show(page) {
  renderOptions(page.id);
  renderPanel(page);
  document.title = `${page.label} — make a demo`;
}

function sync() {
  const page = pageFromHash(location.hash);
  if (!ids.has(location.hash.replace(/^#/, "")) && location.hash) {
    history.replaceState(null, "", `#${page.id}`);
  }
  show(page);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("hashchange", sync);
  if (document.getElementById("options")) sync();
}

export { PAGES, pageFromHash };
