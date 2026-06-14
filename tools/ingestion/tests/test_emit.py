from legisnote_ingest.adapters.base import AcquiredDoc, LawRef
from legisnote_ingest.emit import build_manifest, render_markdown, validate_manifest
from legisnote_ingest.ir import Law, Snapshot
from legisnote_ingest.parse import parse_czech_statute

SAMPLE = """\
§ 1
Předmět úpravy
(1) Tento zákon upravuje právní poměry s mezinárodním prvkem.

§ 2
(1) Zákon se použije v mezích mezinárodních smluv.
"""


def _law_snapshot():
    law = Law(
        citation="91/2012 Sb.",
        number="91",
        year=2012,
        title_cs="Zákon o mezinárodním právu soukromém",
    )
    snapshot = Snapshot(seq=1, effective_from="2023-09-23")
    return law, snapshot


def test_manifest_validates_against_schema():
    law, snapshot = _law_snapshot()
    units = parse_czech_statute(SAMPLE)
    manifest = build_manifest(law, snapshot, units)
    validate_manifest(manifest)  # raises on contract violation

    data = manifest.to_json_dict()
    assert data["manifestVersion"] == "1.0"
    assert data["law"]["citation"] == "91/2012 Sb."
    assert data["units"][0]["nodeKey"] == "s1"


def test_markdown_render_has_title_and_sections():
    law, snapshot = _law_snapshot()
    units = parse_czech_statute(SAMPLE)
    md = render_markdown(law, snapshot, units)
    assert md.startswith("# Zákon o mezinárodním právu soukromém")
    assert "§ 1" in md
    assert "91/2012 Sb." in md


def test_lawref_parse():
    ref = LawRef.parse("91/2012")
    assert ref.number == "91"
    assert ref.year == 2012
    assert ref.citation == "91/2012 Sb."

    doc = AcquiredDoc(text="x", source_kind="lawgpt")
    assert doc.source_kind == "lawgpt"
