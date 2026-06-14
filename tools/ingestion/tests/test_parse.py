from legisnote_ingest.parse import parse_czech_statute

SAMPLE = """\
ČÁST PRVNÍ
OBECNÁ USTANOVENÍ

§ 1
Předmět úpravy

Tento zákon upravuje
(1) právní poměry s mezinárodním prvkem.
(2) Tímto nejsou dotčena pravidla, podle kterých
a) se postupuje přednostně,
b) platí mezinárodní smlouva.

§ 2
Mezinárodní smlouvy

Zákon se použije v mezích mezinárodních smluv.
"""


def test_parses_part_section_paragraph_point():
    units = parse_czech_statute(SAMPLE)

    # One part at the root, containing the two sections.
    assert len(units) == 1
    part = units[0]
    assert part.node_type == "part"
    assert part.node_key == "cast1"

    sections = part.children
    assert [s.label for s in sections] == ["§ 1", "§ 2"]
    assert [s.node_key for s in sections] == ["cast1/s1", "cast1/s2"]

    s1 = sections[0]
    paras = [c for c in s1.children if c.node_type == "paragraph"]
    assert [p.label for p in paras] == ["(1)", "(2)"]

    points = paras[1].children
    assert [p.label for p in points] == ["a)", "b)"]
    assert points[0].node_key == "cast1/s1/o2/pa"


def test_ordinals_are_sequential():
    units = parse_czech_statute(SAMPLE)
    sections = units[0].children
    assert [s.ordinal for s in sections] == [0, 1]
