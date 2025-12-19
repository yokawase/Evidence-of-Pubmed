
import { SearchResult, PubMedArticle } from "../types";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, options: RequestInit = {}, retries = 3): Promise<Response> => {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      if (retries > 0 && (res.status === 429 || res.status >= 500)) {
        await sleep(1000);
        return fetchWithRetry(url, options, retries - 1);
      }
      throw new Error(`NCBI API failed: ${res.status}`);
    }
    return res;
  } catch (error) {
    if (retries > 0) {
      await sleep(1000);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
};

export const executePubMedSearch = async (keywords: string[], years: number): Promise<SearchResult> => {
  const query = keywords.join(" AND ");
  const currentYear = new Date().getFullYear();
  const dates = `&mindate=${currentYear - years}&maxdate=${currentYear}`;
  
  const url = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}${dates}&retmode=json&retmax=30&sort=relevance`;
  const res = await fetchWithRetry(url);
  const data = await res.json();
  
  return {
    count: parseInt(data.esearchresult.count),
    ids: data.esearchresult.idlist || []
  };
};

export const fetchSummary = async (ids: string[]): Promise<PubMedArticle[]> => {
  if (ids.length === 0) return [];
  const url = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
  const res = await fetchWithRetry(url);
  const data = await res.json();
  
  return ids.map(id => {
    const d = data.result[id];
    return {
      id,
      pmid: id,
      title: d.title,
      authors: d.authors?.map((a: any) => a.name).join(", ") || "Unknown Authors",
      journal: d.source,
      pubdate: d.pubdate
    };
  });
};

export const fetchAbstracts = async (ids: string[]): Promise<Record<string, string>> => {
  if (ids.length === 0) return {};
  const url = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
  const res = await fetchWithRetry(url);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  
  const results: Record<string, string> = {};
  Array.from(xml.getElementsByTagName("PubmedArticle")).forEach(node => {
    const pmid = node.querySelector("PMID")?.textContent || "";
    let abstract = "";
    node.querySelectorAll("AbstractText").forEach(t => {
      const label = t.getAttribute("Label");
      abstract += (label ? `[${label}] ` : "") + t.textContent + " ";
    });
    results[pmid] = abstract.trim() || "No abstract available.";
  });
  return results;
};

export const fetchFullText = async (pmid: string): Promise<string | null> => {
  try {
    // 1. Get PMC link
    const linkUrl = `${EUTILS_BASE}/elink.fcgi?dbfrom=pubmed&linkname=pubmed_pmc&id=${pmid}&retmode=json`;
    const linkRes = await fetchWithRetry(linkUrl);
    const linkData = await linkRes.json();
    
    let pmcid = null;
    if (linkData.linksets?.[0]?.linksetdbs?.[0]?.links?.[0]) {
      pmcid = "PMC" + linkData.linksets[0].linksetdbs[0].links[0];
    }
    
    if (!pmcid) return null;
    
    // 2. Fetch PMC text
    const pmcUrl = `${EUTILS_BASE}/efetch.fcgi?db=pmc&id=${pmcid}&retmode=xml`;
    const pmcRes = await fetchWithRetry(pmcUrl);
    const pmcText = await pmcRes.text();
    const xml = new DOMParser().parseFromString(pmcText, "text/xml");
    
    const bodyNode = xml.querySelector("body");
    if (!bodyNode) return null;
    
    return `[FULL TEXT FROM ${pmcid}]\n` + bodyNode.textContent?.replace(/\s+/g, ' ').substring(0, 10000);
  } catch (e) {
    return null;
  }
};

export const fetchReferences = async (pmids: string[]): Promise<string[]> => {
  if (pmids.length === 0) return [];
  const url = `${EUTILS_BASE}/elink.fcgi?dbfrom=pubmed&linkname=pubmed_pubmed_refs&id=${pmids.join('&id=')}&retmode=json`;
  const res = await fetchWithRetry(url);
  const data = await res.json();
  
  const refIds = new Set<string>();
  if (data.linksets) {
    data.linksets.forEach((ls: any) => {
      if (ls.linksetdbs) {
        ls.linksetdbs.forEach((db: any) => {
          if (db.linkname === 'pubmed_pubmed_refs' && db.links) {
            db.links.slice(0, 3).forEach((link: string) => refIds.add(link));
          }
        });
      }
    });
  }
  return Array.from(refIds);
};
