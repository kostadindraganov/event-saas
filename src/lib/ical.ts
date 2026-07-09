export type IcalEvent = {
  uid: string;
  summary: string;
  location: string;
  description: string;
  isFullDay: boolean;
  eventDate: string; // "YYYY-MM-DD"
  startTime: string | null; // "HH:MM"
  endTime: string | null;
};

// Europe/Sofia: EET (UTC+2) standard, EEST (UTC+3) summer; EU DST rules (last Sun Mar/Oct).
const SOFIA_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Sofia",
  "BEGIN:STANDARD",
  "DTSTART:19701025T040000",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "TZNAME:EET",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700329T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "TZNAME:EEST",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 §3.1: fold at 75 octets; continuation lines start with one space.
// Fold by UTF-8 byte length, never splitting a multi-byte char.
function foldLine(line: string): string {
  let out = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > 75) {
      out += "\r\n ";
      bytes = 1; // the leading space counts as one octet
    }
    out += ch;
    bytes += b;
  }
  return out;
}

const dateOnly = (isoDate: string) => isoDate.replace(/-/g, ""); // "YYYY-MM-DD" → "YYYYMMDD"
const localDateTime = (isoDate: string, hhmm: string) =>
  `${dateOnly(isoDate)}T${hhmm.replace(":", "")}00`; // → "YYYYMMDDTHHMMSS"

// All-day DTEND is exclusive → next calendar day. UTC-noon avoids DST edge cases.
function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const utcStamp = (d: Date) =>
  d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // → "YYYYMMDDTHHMMSSZ"

export function buildVendorCalendar(events: IcalEvent[], opts: { dtstamp: Date }): string {
  const stamp = utcStamp(opts.dtstamp);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EVENT-REVIEW//Calendar Feed//BG",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...SOFIA_VTIMEZONE,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (e.isFullDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.eventDate)}`);
      lines.push(`DTEND;VALUE=DATE:${dateOnly(nextDay(e.eventDate))}`);
    } else {
      lines.push(`DTSTART;TZID=Europe/Sofia:${localDateTime(e.eventDate, e.startTime!)}`);
      lines.push(`DTEND;TZID=Europe/Sofia:${localDateTime(e.eventDate, e.endTime!)}`);
    }
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    lines.push(`LOCATION:${escapeText(e.location)}`);
    lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
