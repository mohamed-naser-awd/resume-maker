import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { ATS_HEADINGS, resumeFileName, type TailoredResume } from '@/domain/resume';
import type { RenderedDocument, ResumeRenderer } from '@/ports/ResumeRenderer';

/**
 * ATS-friendly PDF: one column, standard fonts (Helvetica), real selectable text,
 * standard section headings, no tables, images, icons, headers/footers or text boxes.
 */
export class PdfLibResumeRenderer implements ResumeRenderer {
  async render(resume: TailoredResume): Promise<RenderedDocument> {
    const doc = await PDFDocument.create();
    const fonts = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
      italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    };
    const w = new Writer(doc, fonts);
    const c = resume.contact;

    w.text(c.fullName, { font: fonts.bold, size: 18 });
    if (resume.headline) w.text(resume.headline, { size: 11, gapAfter: 2 });
    w.text([c.location, c.phone, c.email].filter(Boolean).join('  |  '), { size: 9.5 });
    const links = [c.linkedin, c.github, c.website].filter(Boolean).join('  |  ');
    if (links) w.text(links, { size: 9.5 });

    if (resume.summary) {
      w.heading(ATS_HEADINGS.summary);
      w.text(resume.summary, { size: 10 });
    }

    if (resume.skills.length) {
      w.heading(ATS_HEADINGS.skills);
      for (const g of resume.skills) w.labeled(`${g.category}: `, g.items.join(', '));
    }

    if (resume.experience.length) {
      w.heading(ATS_HEADINGS.experience);
      resume.experience.forEach((e, i) => {
        if (i > 0) w.space(6);
        w.ensure(40);
        w.leftRight(e.title, [e.startDate, e.endDate].filter(Boolean).join(' – '), fonts.bold);
        w.text([e.company, e.location].filter(Boolean).join(', '), { font: fonts.italic, size: 10, gapAfter: 2 });
        for (const b of e.bullets) w.bullet(b);
      });
    }

    if (resume.education.length) {
      w.heading(ATS_HEADINGS.education);
      for (const ed of resume.education) {
        const degree = [ed.degree, ed.field].filter(Boolean).join(', ');
        w.leftRight(degree || ed.institution, ed.endDate, fonts.bold);
        if (degree) w.text(ed.institution, { font: fonts.italic, size: 10 });
        if (ed.details) w.text(ed.details, { size: 10 });
        w.space(3);
      }
    }

    if (resume.certifications.length) {
      w.heading(ATS_HEADINGS.certifications);
      for (const cert of resume.certifications) w.bullet(cert);
    }

    doc.setTitle(`${c.fullName} – Resume`);
    doc.setAuthor(c.fullName);
    doc.setSubject(resume.jobTitle ? `Resume for ${resume.jobTitle}` : 'Resume');
    doc.setKeywords(resume.targetKeywords);
    doc.setCreator('Resume Maker');
    doc.setProducer('Resume Maker');

    return {
      fileName: resumeFileName(resume),
      mimeType: 'application/pdf',
      bytes: await doc.save(),
    };
  }
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

interface TextOpts {
  font?: PDFFont;
  size?: number;
  indent?: number;
  gapAfter?: number;
}

const PAGE = { width: 612, height: 792, margin: 50 }; // US Letter, ~0.7in margins
const INK = rgb(0.1, 0.1, 0.1);

/** Tiny flow-layout helper: wraps text, adds pages, sanitises unsupported glyphs. */
class Writer {
  private page: PDFPage;
  private y: number;
  private readonly maxWidth = PAGE.width - PAGE.margin * 2;
  private readonly glyphCache = new Map<string, boolean>();

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  space(pt: number) {
    this.y -= pt;
  }

  ensure(height: number) {
    if (this.y - height < PAGE.margin) {
      this.page = this.doc.addPage([PAGE.width, PAGE.height]);
      this.y = PAGE.height - PAGE.margin;
    }
  }

  heading(title: string) {
    this.space(10);
    this.ensure(30);
    this.drawLine(title.toUpperCase(), PAGE.margin, this.fonts.bold, 11.5);
    this.y -= 4;
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.width - PAGE.margin, y: this.y },
      thickness: 0.6,
      color: INK,
    });
    this.y -= 5;
  }

  text(content: string, opts: TextOpts = {}) {
    const font = opts.font ?? this.fonts.regular;
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    for (const line of this.wrap(this.clean(content, font), font, size, this.maxWidth - indent)) {
      this.ensure(size * 1.35);
      this.drawLine(line, PAGE.margin + indent, font, size);
    }
    this.y -= opts.gapAfter ?? 1;
  }

  /** "Label: value" with a bold label, wrapping under the label. */
  labeled(label: string, value: string, size = 10) {
    const bold = this.fonts.bold;
    const reg = this.fonts.regular;
    const l = this.clean(label, bold);
    const labelWidth = bold.widthOfTextAtSize(l, size);
    const lines = this.wrap(this.clean(value, reg), reg, size, this.maxWidth - labelWidth);
    lines.forEach((line, i) => {
      this.ensure(size * 1.35);
      this.y -= size * 1.2;
      if (i === 0) this.page.drawText(l, { x: PAGE.margin, y: this.y, size, font: bold, color: INK });
      this.page.drawText(line, { x: PAGE.margin + labelWidth, y: this.y, size, font: reg, color: INK });
      this.y -= size * 0.15;
    });
    this.y -= 1;
  }

  bullet(content: string, size = 10) {
    const font = this.fonts.regular;
    const indent = 12;
    const lines = this.wrap(this.clean(content, font), font, size, this.maxWidth - indent);
    lines.forEach((line, i) => {
      this.ensure(size * 1.35);
      this.y -= size * 1.2;
      if (i === 0) this.page.drawText('•', { x: PAGE.margin + 2, y: this.y, size, font, color: INK });
      this.page.drawText(line, { x: PAGE.margin + indent, y: this.y, size, font, color: INK });
      this.y -= size * 0.15;
    });
    this.y -= 1;
  }

  /** Left text (e.g. job title) with right-aligned text (dates) on the same line. */
  leftRight(left: string, right: string, leftFont: PDFFont, size = 10.5) {
    const regular = this.fonts.regular;
    const r = this.clean(right, regular);
    const rWidth = r ? regular.widthOfTextAtSize(r, size) : 0;
    const lLines = this.wrap(this.clean(left, leftFont), leftFont, size, this.maxWidth - rWidth - 12);
    this.ensure(size * 1.35 * lLines.length);
    this.y -= size * 1.2;
    lLines.forEach((line, i) => {
      if (i > 0) this.y -= size * 1.2;
      this.page.drawText(line, { x: PAGE.margin, y: this.y, size, font: leftFont, color: INK });
    });
    if (r) {
      this.page.drawText(r, { x: PAGE.width - PAGE.margin - rWidth, y: this.y + size * 1.2 * (lLines.length - 1), size, font: regular, color: INK });
    }
    this.y -= size * 0.25;
  }

  private drawLine(line: string, x: number, font: PDFFont, size: number) {
    this.y -= size * 1.2;
    this.page.drawText(line, { x, y: this.y, size, font, color: INK });
    this.y -= size * 0.15;
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
          line = candidate;
        } else {
          out.push(line);
          line = word;
        }
      }
      if (line) out.push(line);
    }
    return out.length ? out : [''];
  }

  /** Standard PDF fonts only cover WinAnsi; replace or drop anything else. */
  private clean(text: string, font: PDFFont): string {
    const replaced = text
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[→⇒]/g, '->')
      .replace(/[•●▪‣]/g, '-')
      .replace(/ /g, ' ')
      .replace(/[\t\r]/g, ' ');
    let out = '';
    for (const ch of replaced) {
      if (ch === '\n') {
        out += ch;
        continue;
      }
      let ok = this.glyphCache.get(ch);
      if (ok === undefined) {
        try {
          font.encodeText(ch);
          ok = true;
        } catch {
          ok = false;
        }
        this.glyphCache.set(ch, ok);
      }
      if (ok) out += ch;
    }
    return out;
  }
}
