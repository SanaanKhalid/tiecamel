#!/usr/bin/env python3
"""Generate the clearly-labeled PDF fixtures served by the TieCamel demo."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "apps" / "app" / "public" / "demo-documents"

TEAL = colors.HexColor("#0F766E")
INK = colors.HexColor("#17211E")
MUTED = colors.HexColor("#5F6B66")
LINE = colors.HexColor("#D7E2DE")
PAPER = colors.HexColor("#F7FAF8")
AMBER = colors.HexColor("#B45309")


DOCUMENTS = [
    {
        "file": "2026-property-tax-notice.pdf",
        "eyebrow": "COMPLIANCE / ACCEPTED TAX NOTICE",
        "title": "2026 Property Tax Notice",
        "subtitle": "Community Center - Main Campus",
        "summary": (
            "Previously accepted county notice retained as the comparison baseline "
            "for later revisions."
        ),
        "fields": [
            ("Property account", "14-22-301-008"),
            ("Notice date", "May 8, 2026"),
            ("Amount due", "$18,420.00"),
            ("Penalty and interest", "$0.00"),
            ("Response deadline", "August 15, 2026"),
            ("Exemption status", "Application pending"),
        ],
        "sections": [
            (
                "Accepted record",
                "This demo version represents the exact source bytes accepted in "
                "May and used as the base for the revised notice comparison.",
            ),
        ],
    },
    {
        "file": "2026-property-tax-notice-revised.pdf",
        "eyebrow": "COMPLIANCE / TAX NOTICE",
        "title": "Revised 2026 Property Tax Notice",
        "subtitle": "Community Center - Main Campus",
        "summary": (
            "Revised county notice received for independent review before it is "
            "accepted into the permanent record."
        ),
        "fields": [
            ("Property account", "14-22-301-008"),
            ("Notice date", "July 21, 2026"),
            ("Amount due", "$21,860.00"),
            ("Penalty and interest", "$1,340.00"),
            ("Response deadline", "July 29, 2026"),
            ("Exemption status", "Not reflected on revised notice"),
        ],
        "sections": [
            (
                "Reviewer attention",
                "Confirm the response deadline, exemption reference, and balance "
                "against the county portal before acceptance.",
            ),
        ],
    },
    {
        "file": "general-liability-renewal-summary.pdf",
        "eyebrow": "COMPLIANCE / INSURANCE",
        "title": "General Liability Renewal Summary",
        "subtitle": "Organization-wide coverage",
        "summary": (
            "Renewal packet summary for the Main Campus, Youth Center, and ICN School."
        ),
        "fields": [
            ("Carrier", "Community Mutual Assurance"),
            ("Policy term", "August 1, 2026 - July 31, 2027"),
            ("General aggregate", "$4,000,000"),
            ("Per occurrence", "$2,000,000"),
            ("Annual premium", "$28,650"),
            ("Binder status", "Pending authorized acceptance"),
        ],
        "sections": [
            (
                "Required follow-up",
                "Verify the additional-insured schedule and obtain the final signed "
                "binder before the existing policy expires.",
            ),
        ],
    },
    {
        "file": "2026-charitable-registration-workpaper.pdf",
        "eyebrow": "COMPLIANCE / STATE FILING",
        "title": "2026 Charitable Registration Workpaper",
        "subtitle": "Annual organization filing",
        "summary": (
            "Preparation checklist for the annual Illinois charitable registration."
        ),
        "fields": [
            ("Reporting period", "January 1 - December 31, 2025"),
            ("Filing deadline", "October 15, 2026"),
            ("Responsible owner", "Maya Patel"),
            ("Financial statements", "Ready for review"),
            ("Officer certification", "Pending"),
            ("Filing status", "Draft"),
        ],
        "sections": [
            (
                "Evidence checklist",
                "Attach the signed annual report, audited financial statements, fee "
                "confirmation, and reviewer certification.",
            ),
        ],
    },
    {
        "file": "property-remediation-plan.pdf",
        "eyebrow": "GOVERNANCE / BOARD MATERIAL",
        "title": "Property Compliance Remediation Plan",
        "subtitle": "Main Campus",
        "summary": (
            "Proposed plan for resolving the property compliance findings and "
            "tracking evidence through completion."
        ),
        "fields": [
            ("Decision owner", "Board of Directors"),
            ("Operational owner", "Compliance Director"),
            ("Counsel budget", "$12,500 authorized ceiling"),
            ("Evidence cadence", "Weekly until resolved"),
            ("Target completion", "September 30, 2026"),
            ("Final verification", "Independent reviewer required"),
        ],
        "sections": [
            (
                "Proposed resolution",
                "Authorize counsel support, weekly evidence review, and escalation "
                "of any missed milestone to the Board Secretary and President.",
            ),
        ],
    },
    {
        "file": "youth-enrichment-grant-allocation-proposal.pdf",
        "eyebrow": "FUNDING / GRANT PROPOSAL",
        "title": "Youth Enrichment Grant Allocation",
        "subtitle": "Youth Center - 2026 program cycle",
        "summary": (
            "Proposal to allocate restricted grant funds across tutoring, leadership, "
            "and family enrichment programming."
        ),
        "fields": [
            ("Grant award", "$85,000"),
            ("Program services", "$58,000"),
            ("Materials and technology", "$12,000"),
            ("Transportation support", "$8,000"),
            ("Evaluation and reporting", "$5,000"),
            ("Contingency", "$2,000"),
        ],
        "sections": [
            (
                "Restrictions",
                "Funds may be used only for the approved Youth Center program. "
                "Administrative overhead is excluded without written funder consent.",
            ),
            (
                "Member feedback",
                "Prioritize evening tutoring access, publish quarterly participation "
                "metrics, and report any budget variance above ten percent.",
            ),
        ],
    },
    {
        "file": "q2-2026-member-transparency-report.pdf",
        "eyebrow": "TRANSPARENCY / MEMBER REPORT",
        "title": "Q2 2026 Member Transparency Report",
        "subtitle": "Organization-wide",
        "summary": (
            "Draft member report covering governance decisions, financial activity, "
            "compliance work, and publication checks."
        ),
        "fields": [
            ("Reporting period", "April 1 - June 30, 2026"),
            ("Board decisions recorded", "7"),
            ("Open compliance matters", "3"),
            ("Funding approved", "$146,500"),
            ("Public records added", "6"),
            ("Publication status", "Privacy review pending"),
        ],
        "sections": [
            (
                "Publication checklist",
                "Complete privacy review, confirm board approval, verify source "
                "records, and publish only the accepted public projection.",
            ),
        ],
    },
    {
        "file": "q1-2026-board-minutes.pdf",
        "eyebrow": "GOVERNANCE / APPROVED MINUTES",
        "title": "Q1 2026 Board Meeting Minutes",
        "subtitle": "Regular meeting - March 18, 2026",
        "summary": (
            "Approved record of attendance, recusals, motions, votes, and assigned "
            "follow-up work."
        ),
        "fields": [
            ("Directors present", "8 of 9"),
            ("Quorum", "Confirmed"),
            ("Recusals recorded", "1"),
            ("Motions approved", "4"),
            ("Follow-up issues created", "3"),
            ("Approved on", "April 15, 2026"),
        ],
        "sections": [
            (
                "Record note",
                "These demo minutes summarize the governed record. The signed source "
                "and vote receipts would be retained with the accepted version.",
            ),
        ],
    },
    {
        "file": "icn-bylaws-2026.pdf",
        "eyebrow": "GOVERNANCE / GOVERNING DOCUMENT",
        "title": "ICN Bylaws - 2026 Edition",
        "subtitle": "Accepted version 4",
        "summary": (
            "Consolidated governing document reflecting the board composition "
            "amendment approved on March 18, 2026."
        ),
        "fields": [
            ("Effective date", "March 18, 2026"),
            ("Accepted version", "4"),
            ("Board seats", "9"),
            ("Quorum requirement", "Majority of eligible directors"),
            ("Member notice", "Completed"),
            ("Record status", "Accepted"),
        ],
        "sections": [
            (
                "Document scope",
                "This demonstration excerpt summarizes the accepted record. The "
                "production version would retain the full signed governing document.",
            ),
        ],
    },
    {
        "file": "icn-q1-2026-transparency-report.pdf",
        "eyebrow": "TRANSPARENCY / PUBLIC RECORD",
        "title": "Q1 2026 Transparency Report",
        "subtitle": "Accepted public version",
        "summary": (
            "Board-approved public report covering decisions, funding, compliance "
            "activity, and published records for the first quarter."
        ),
        "fields": [
            ("Reporting period", "January 1 - March 31, 2026"),
            ("Board meetings", "3"),
            ("Decisions published", "5"),
            ("Funding approved", "$92,400"),
            ("Compliance items closed", "4"),
            ("Public records added", "5"),
        ],
        "sections": [
            (
                "Integrity note",
                "The accepted public artifact is checksum-verified and its digest is "
                "anchored to the configured transparency network.",
            ),
        ],
    },
]


def build_styles():
    base = getSampleStyleSheet()
    return {
        "demo": ParagraphStyle(
            "Demo",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.white,
            alignment=TA_CENTER,
            spaceAfter=0,
        ),
        "eyebrow": ParagraphStyle(
            "Eyebrow",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            tracking=1.5,
            textColor=TEAL,
            spaceAfter=8,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=INK,
            spaceAfter=5,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=14,
            textColor=MUTED,
            spaceAfter=18,
        ),
        "summary": ParagraphStyle(
            "Summary",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=16,
            textColor=INK,
            spaceAfter=18,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=INK,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=14,
            textColor=MUTED,
        ),
        "label": ParagraphStyle(
            "Label",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=10,
            textColor=MUTED,
        ),
        "value": ParagraphStyle(
            "Value",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=INK,
        ),
    }


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = LETTER
    canvas.setFillColor(TEAL)
    canvas.rect(0, height - 0.18 * inch, width, 0.18 * inch, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, 0.55 * inch, width - doc.rightMargin, 0.55 * inch)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(doc.leftMargin, 0.34 * inch, "TieCamel demo fixture - generated July 2026")
    canvas.drawRightString(
        width - doc.rightMargin,
        0.34 * inch,
        f"Page {doc.page}",
    )
    canvas.restoreState()


def build_document(spec, styles):
    path = OUTPUT_DIR / spec["file"]
    document = SimpleDocTemplate(
        str(path),
        pagesize=LETTER,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.52 * inch,
        bottomMargin=0.72 * inch,
        title=spec["title"],
        author="TieCamel",
        subject="Demonstration record - not an official document",
        invariant=1,
    )

    story = [
        Table(
            [[Paragraph("DEMO RECORD - NOT AN OFFICIAL DOCUMENT", styles["demo"])]],
            colWidths=[7.2 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), AMBER),
                    ("BOX", (0, 0), (-1, -1), 0.5, AMBER),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        ),
        Spacer(1, 0.22 * inch),
        Paragraph(spec["eyebrow"], styles["eyebrow"]),
        Paragraph(spec["title"], styles["title"]),
        Paragraph(spec["subtitle"], styles["subtitle"]),
        Paragraph(spec["summary"], styles["summary"]),
    ]

    rows = []
    for index in range(0, len(spec["fields"]), 2):
        pair = spec["fields"][index : index + 2]
        row = []
        for label, value in pair:
            row.append(
                [
                    Paragraph(label.upper(), styles["label"]),
                    Spacer(1, 3),
                    Paragraph(value, styles["value"]),
                ]
            )
        while len(row) < 2:
            row.append("")
        rows.append(row)

    details = Table(rows, colWidths=[3.48 * inch, 3.48 * inch], hAlign="LEFT")
    details.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 11),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
            ]
        )
    )
    story.extend([details, Spacer(1, 0.22 * inch)])

    for title, body in spec["sections"]:
        story.extend(
            [
                KeepTogether(
                    [
                        Paragraph(title, styles["section"]),
                        Paragraph(body, styles["body"]),
                    ]
                ),
                Spacer(1, 0.16 * inch),
            ]
        )

    document.build(story, onFirstPage=header_footer, onLaterPages=header_footer)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    styles = build_styles()
    for spec in DOCUMENTS:
        build_document(spec, styles)
        print(OUTPUT_DIR / spec["file"])


if __name__ == "__main__":
    main()
