from pathlib import Path

FILES = [
    Path("src/App.tsx"),
    Path("src/demo-data.ts"),
]

REPLACEMENTS = {
    # Remaining app UI text
    "Gap Drivers tarihi": "Gap Drivers date",
    "Politika tamponu": "Policy buffer",
    "Lender Yoğunlaşması": "Lender Concentration",
    "Limit sonrası vade açığı": "Residual Funding Gap",

    # Executive policy-status labels
    '${policyLimits.counts.BREACH} ihlal': '${policyLimits.counts.BREACH} breaches',
    '${policyLimits.counts.WATCH} izleme': '${policyLimits.counts.WATCH} watch',
    '"Limitler içinde"': '"Within limits"',

    # Demo maturity labels
    '"Vadesi geçmiş"': '"Overdue"',
    '"Geçmiş"': '"Overdue"',

    # Demo lender names / labels
    # Keep proper names intact; only normalize the Turkish bank suffix.
    '"Anadolu Bankası"': '"Anadolu Bank"',
    '"Diğer"': '"Other"',

    # Help browsers understand that date controls belong to an English UI.
    'id="gap-date" type="date"': 'id="gap-date" lang="en-GB" type="date"',
}

for path in FILES:
    if not path.exists():
        print(f"Skipping missing file: {path}")
        continue

    text = path.read_text(encoding="utf-8")
    original = text

    for old, new in REPLACEMENTS.items():
        text = text.replace(old, new)

    if text != original:
        path.write_text(text, encoding="utf-8")
        print(f"Updated: {path}")
    else:
        print(f"No changes needed: {path}")

print("\nRemaining checks:")
for path in FILES:
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    for term in [
        "Gap Drivers tarihi",
        "Politika tamponu",
        "Lender Yoğunlaşması",
        "Limit sonrası vade açığı",
        " ihlal",
        " izleme",
        "Limitler içinde",
        "Vadesi geçmiş",
        "Geçmiş",
        "Anadolu Bankası",
        "Diğer",
    ]:
        if term in text:
            print(f"  {path}: still contains {term!r}")
