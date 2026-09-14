from pathlib import Path

FILES = [
    Path("src/App.tsx"),
    Path("src/demo-data.ts"),
]

REPLACEMENTS = {
    # Remaining app UI text
    "Gap Drivers tarihi": "Gap Drivers date",
    "Politika tamponu": "Policy buffer",

    # Demo maturity labels
    '"Vadesi geçmiş"': '"Overdue"',
    '"Geçmiş"': '"Overdue"',

    # Demo lender names / labels
    # Keep the proper name "Anadolu"; only normalize the Turkish bank suffix.
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
        "Vadesi geçmiş",
        "Geçmiş",
        "Anadolu Bankası",
        "Diğer",
    ]:
        if term in text:
            print(f"  {path}: still contains {term!r}")
