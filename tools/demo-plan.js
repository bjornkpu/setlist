// Seed BK's real NDC Oslo day-1 plan into IndexedDB for README screenshots
// (picks match his phone; maybe counts match the +N badges he showed).
// Run in the app's page via tools/screenshot.mjs --init after the schedule
// has loaded; the tool re-navigates afterwards so the app picks the plan up.
(async () => {
  const KEY = "/conferences/ndc-oslo-2026.json";
  const json = await (await fetch(KEY)).json();
  const byTitle = {};
  for (const day of json.schedule.conference.days)
    for (const evs of Object.values(day.rooms))
      for (const e of evs) byTitle[e.title] = e.guid;

  const STATES = {
    pick: [
      "Keynote: Who are you?",
      "Socio-technical API patterns",
      "CSS State Machine",
      "Non-Blocking Continuous Code Reviews, a Case Study",
      "How We Built an Autonomous Development Workflow at Nordic Corporate Bank",
      "Tracking every ship in Norwegian waters - Building a data platform for The Coastal Administration",
      "Functional core, imperative shell: An architecture turned inside out",
    ],
    maybe: [
      // 10:20 (+4)
      "Use AI to build AI (without losing your mind) with Aspire",
      "INTL: The best browser API you're not using",
      "What's coming next in C#",
      "If You Feel Behind, You’re Probably Paying Attention",
      // 13:40 (+4)
      "What Claude Code Can Do That You Haven't Tried",
      "From Code to Intelligence: The Rise of the Full-Stack AI Engineer",
      "Types Are Worth the Typing",
      "Let's break some WCAG rules",
      // 15:00 (+4)
      ".NET Telemetry in the Real World",
      "What You Need to Know (And Why You Should Care) About AI Governance",
      "Modern Graph Databases",
      "Rethinking Tooltips with Interest Invokers and Popover API",
      // 16:20 (+1)
      "Using Microsoft Kiota to go from OpenAPI to first-class .NET client SDKs",
      // 17:40 (+2)
      "Going Passwordless - A Practical Guide to Passkeys in ASP.NET Core",
      "It’s About Time! Practical examples of time zones in TypeScript",
    ],
    avoid: [
      "TBA - Adam Cogan",
      "Why LLMs Suck (aka the Software Developer's Guide to Keeping Our Jobs)",
    ],
  };

  const entries = {};
  for (const [st, titles] of Object.entries(STATES))
    for (const t of titles) {
      if (!byTitle[t]) throw new Error(`title not in schedule: ${t}`);
      entries[byTitle[t]] = st;
    }

  await new Promise((resolve, reject) => {
    const open = indexedDB.open("setlist");
    open.onsuccess = () => {
      const tx = open.result.transaction("plans", "readwrite");
      tx.objectStore("plans").put({ key: KEY, entries });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
})()
