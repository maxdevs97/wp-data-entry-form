const crypto = require('crypto');
const cheerio = require('cheerio');

class ContentHasher {
  static stripHTML(html) {
    const $ = cheerio.load(html);
    return $('body').text();
  }

  static normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  static hashContent(html) {
    const text = this.stripHTML(html);
    const normalized = this.normalizeText(text);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  static compareContent(sourceHTML, destinationHTML) {
    const sourceHash = this.hashContent(sourceHTML);
    const destHash = this.hashContent(destinationHTML);
    
    return {
      match: sourceHash === destHash,
      sourceHash,
      destinationHash: destHash
    };
  }

  static wordCount(html) {
    const text = this.stripHTML(html);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return words.length;
  }

  static compareWordCount(sourceHTML, destHTML, tolerance = 0.05) {
    const sourceCount = this.wordCount(sourceHTML);
    const destCount = this.wordCount(destHTML);
    
    const difference = Math.abs(sourceCount - destCount);
    const percentDiff = sourceCount > 0 ? difference / sourceCount : 0;
    
    return {
      match: percentDiff <= tolerance,
      sourceCount,
      destinationCount: destCount,
      difference,
      percentDifference: percentDiff
    };
  }

  static extractHeadingStructure(html) {
    const $ = cheerio.load(html);
    const headings = [];
    
    $('h1, h2, h3, h4, h5, h6').each((i, elem) => {
      headings.push({
        level: elem.name,
        text: $(elem).text().trim()
      });
    });
    
    return headings;
  }

  static compareHeadingStructure(sourceHTML, destHTML) {
    const sourceHeadings = this.extractHeadingStructure(sourceHTML);
    const destHeadings = this.extractHeadingStructure(destHTML);
    
    if (sourceHeadings.length !== destHeadings.length) {
      return {
        match: false,
        sourceHeadings,
        destinationHeadings: destHeadings,
        message: `Heading count mismatch: ${sourceHeadings.length} vs ${destHeadings.length}`
      };
    }
    
    const mismatches = [];
    for (let i = 0; i < sourceHeadings.length; i++) {
      if (sourceHeadings[i].level !== destHeadings[i].level) {
        mismatches.push({
          index: i,
          source: sourceHeadings[i],
          destination: destHeadings[i]
        });
      }
    }
    
    return {
      match: mismatches.length === 0,
      sourceHeadings,
      destinationHeadings: destHeadings,
      mismatches
    };
  }

  static extractLinks(html) {
    const $ = cheerio.load(html);
    const links = [];
    
    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().trim();
      
      if (href) {
        links.push({
          href,
          text,
          isExternal: href.startsWith('http://') || href.startsWith('https://'),
          isInternal: href.startsWith('/') || !href.includes('://')
        });
      }
    });
    
    return links;
  }

  static compareLinks(sourceHTML, destHTML) {
    const sourceLinks = this.extractLinks(sourceHTML);
    const destLinks = this.extractLinks(destHTML);
    
    return {
      match: sourceLinks.length === destLinks.length,
      sourceCount: sourceLinks.length,
      destinationCount: destLinks.length,
      sourceLinks,
      destinationLinks: destLinks
    };
  }

  static extractTables(html) {
    const $ = cheerio.load(html);
    const tables = [];
    
    $('table').each((i, elem) => {
      const rows = $(elem).find('tr').length;
      const cols = $(elem).find('tr').first().find('th, td').length;
      
      tables.push({
        html: $.html(elem),
        rows,
        cols,
        cellCount: rows * cols
      });
    });
    
    return tables;
  }

  static compareTables(sourceHTML, destHTML) {
    const sourceTables = this.extractTables(sourceHTML);
    const destTables = this.extractTables(destHTML);
    
    if (sourceTables.length !== destTables.length) {
      return {
        match: false,
        sourceCount: sourceTables.length,
        destinationCount: destTables.length,
        message: `Table count mismatch: ${sourceTables.length} vs ${destTables.length}`
      };
    }
    
    const mismatches = [];
    for (let i = 0; i < sourceTables.length; i++) {
      if (sourceTables[i].rows !== destTables[i].rows || 
          sourceTables[i].cols !== destTables[i].cols) {
        mismatches.push({
          index: i,
          source: { rows: sourceTables[i].rows, cols: sourceTables[i].cols },
          destination: { rows: destTables[i].rows, cols: destTables[i].cols }
        });
      }
    }
    
    return {
      match: mismatches.length === 0,
      sourceTables,
      destinationTables: destTables,
      mismatches
    };
  }
}

module.exports = ContentHasher;
