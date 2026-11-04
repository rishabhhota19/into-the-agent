export interface Link {
  label: string;
  href: string;
}

export interface Block {
  type: 'h' | 'p' | 'list';
  text?: string;
  items?: string[];
}

export interface Item {
  slug: string;
  title: string;
  kicker: string;
  summary: string;
  body: string;
  tags: string[];
  featured: boolean;
  link?: Link;
  /** Full write-up (projects only). */
  blocks?: Block[];
}

export interface Section {
  id: string;
  label: string;
  path: string;
  intro: string;
  items: Item[];
}

export interface DockStation {
  kicker: string;
  title: string;
  body: string;
  tags?: string[];
  link?: Link;
}

export interface SiteContent {
  site: {
    name: string;
    role: string;
    tagline: string;
    location: string;
    email: string;
    linkedin: string;
    github: string;
    resume: string;
    url: string;
  };
  home: { now: string; wins: string[]; roles: string };
  assets: { rabbit: boolean; projects: Record<string, string> };
  /** The services chamber's own words: its label, intro and the stations after the pods. */
  dock: { label: string; intro: string; stations: DockStation[] };
  sections: Section[];
}
