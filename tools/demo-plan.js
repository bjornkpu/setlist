// Seed a realistic NDC Oslo day-1 plan into IndexedDB for README screenshots.
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
      "Use AI to build AI (without losing your mind) with Aspire",
      "Build Skills, Not Agents",
      "What Claude Code Can Do That You Haven't Tried",
      "Using Microsoft Kiota to go from OpenAPI to first-class .NET client SDKs",
      "Going Passwordless - A Practical Guide to Passkeys in ASP.NET Core",
    ],
    maybe: [
      "INTL: The best browser API you're not using",
      "What's coming next in C#",
      "What's new in SQL Server 2025 and Azure SQL Databases",
      "From Code to Intelligence: The Rise of the Full-Stack AI Engineer",
      // 15:00 has maybes but no pick: a contested, undecided slot
      "How We Built an Autonomous Development Workflow at Nordic Corporate Bank",
      ".NET Telemetry in the Real World",
      "Tracking every ship in Norwegian waters - Building a data platform for The Coastal Administration",
      "Functional core, imperative shell: An architecture turned inside out",
    ],
    avoid: [
      "Socio-technical API patterns",
      "If You Feel Behind, You’re Probably Paying Attention",
      "The .NET MAUI Community Toolkits: Three (3) Essential Libraries for Every .NET MAUI Developer",
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
