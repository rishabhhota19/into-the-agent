export interface Link {
  label: string;
  href: string;
}

/** A chip under a title: a plain word, or one that opens something (`href`), with an optional second line. */
export interface Chip {
  label: string;
  href?: string;
  /** A second, quieter line: a certificate's issuer, a use's kind. */
  note?: string;
  /** How many things it opens onto (a skill's uses). */
  n?: number;
}

export interface Block {
  type: 'h' | 'p' | 'list' | 'links';
  text?: string;
  items?: string[];
  /** `links`: things to open, each an address inside the descent or on the written site. */
  links?: Chip[];
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
  /** Full write-up, for the window. */
  blocks?: Block[];
  /** The skills it lists, each opening the skill (and from there everything else that used it). */
  skills?: Chip[];
  /** A wall's cards (the skills of one group, three certificates), shown instead of `tags`. */
  chips?: Chip[];
  /** The work behind an achievement, for its window's link. */
  related?: Link;
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
  home: {
    now: string;
    wins: string[];
    roles: string;
    hero?: { kicker: string; title: string; body: string };
    /** The one-glance work history: role, company, years, newest first. */
    history?: { body: string; roles: { title: string; company: string; years: string }[] };
  };
  /** Project pictures (public/assets/projects/<slug>.*) and the credit a licensed one must carry. */
  assets: { projects: Record<string, string>; credits?: Record<string, string> };
  /** The services chamber's own words: its label, intro and the stations after the pods. */
  dock: { label: string; intro: string; stations: DockStation[] };
  /** Every skill by slug, with the projects, papers and roles that list it. */
  skills: Record<string, { label: string; uses: Chip[] }>;
  sections: Section[];
}
