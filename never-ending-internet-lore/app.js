const peopleById = new Map();
let allEvents = [];
let activePerson = null;

async function load() {
  const [peopleRes, eventsRes] = await Promise.all([
    fetch("./data/people.json"),
    fetch("./data/events.json"),
  ]);
  if (!peopleRes.ok || !eventsRes.ok) throw new Error("Failed to load lore data");
  const people = await peopleRes.json();
  const events = await eventsRes.json();
  people.forEach((p) => peopleById.set(p.id, p));
  allEvents = events.slice().sort((a, b) => a.date.localeCompare(b.date));
  renderFilters(people);
  renderEvents();
}

function renderFilters(people) {
  const root = document.getElementById("filters");
  root.innerHTML = "";

  const label = document.createElement("span");
  label.className = "filters-label";
  label.textContent = "Filter";
  root.appendChild(label);

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "chip chip-all is-active";
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => setPerson(null));
  root.appendChild(allBtn);

  people.forEach((person) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.person = person.id;
    btn.textContent = person.name.split(" ")[0];
    btn.title = person.name;
    btn.addEventListener("click", () => setPerson(person.id));
    root.appendChild(btn);
  });
}

function setPerson(id) {
  activePerson = id;
  document.querySelectorAll(".chip").forEach((el) => {
    const pid = el.dataset.person;
    if (el.classList.contains("chip-all")) {
      el.classList.toggle("is-active", id === null);
    } else {
      el.classList.toggle("is-active", pid === id);
    }
  });
  renderEvents();
}

function filteredEvents() {
  if (!activePerson) return allEvents;
  return allEvents.filter((ev) => ev.people.includes(activePerson));
}

function formatDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function renderEvents() {
  const list = document.getElementById("event-list");
  const meta = document.getElementById("timeline-meta");
  const events = filteredEvents();
  meta.textContent = `${events.length} public beat${events.length === 1 ? "" : "s"} · newest last`;

  list.innerHTML = "";
  if (!events.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No events for that person yet.";
    list.appendChild(empty);
    return;
  }

  events.forEach((ev) => {
    const li = document.createElement("li");
    li.className = "event";
    li.dataset.eventId = ev.id;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "event-btn";
    btn.setAttribute("aria-expanded", "false");

    const dateEl = document.createElement("span");
    dateEl.className = "event-date";
    dateEl.textContent = formatDate(ev.date);

    const main = document.createElement("div");
    const title = document.createElement("div");
    title.className = "event-headline";
    title.textContent = ev.title;

    const era = document.createElement("span");
    era.className = "event-era";
    era.textContent = ev.era.replace(/-/g, " ");

    const tags = document.createElement("div");
    tags.className = "event-people";
    ev.people.forEach((pid) => {
      const p = peopleById.get(pid);
      const tag = document.createElement("span");
      tag.className = "person-tag";
      tag.textContent = p ? p.name.split(" ")[0] : pid;
      tags.appendChild(tag);
    });

    main.appendChild(title);
    main.appendChild(era);
    main.appendChild(tags);

    btn.appendChild(dateEl);
    btn.appendChild(main);

    const detail = document.createElement("div");
    detail.className = "event-detail";
    detail.hidden = true;

    const summary = document.createElement("p");
    summary.textContent = ev.summary;
    detail.appendChild(summary);

    if (ev.links?.length) {
      const linksWrap = document.createElement("div");
      linksWrap.className = "event-links";
      ev.links.forEach((link) => {
        const a = document.createElement("a");
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = link.label;
        const type = document.createElement("span");
        type.className = "link-type";
        type.textContent = link.type || "link";
        a.appendChild(type);
        linksWrap.appendChild(a);
      });
      detail.appendChild(linksWrap);
    }

    btn.addEventListener("click", () => {
      const open = li.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      detail.hidden = !open;
    });

    li.appendChild(btn);
    li.appendChild(detail);
    list.appendChild(li);
  });
}

load().catch((err) => {
  console.error(err);
  document.getElementById("timeline-meta").textContent = "Could not load timeline data.";
});
