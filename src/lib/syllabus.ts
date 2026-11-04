// Syllabus templates. Chapter names follow the NCERT rationalised textbooks
// (used by CBSE, UP Board and most NCERT-based state boards, and the base for
// JEE Main / NEET). Always confirm with your official syllabus — you can edit,
// add or delete any chapter after applying a template.
import { supabase } from './supabase';
import { invalidateLookups } from './useLookups';

type Cls = '11' | '12';
type Book = Record<Cls, string[]>;

const PHYSICS: Book = {
  '11': [
    'Units and Measurement', 'Motion in a Straight Line', 'Motion in a Plane', 'Laws of Motion', 'Work, Energy and Power',
    'System of Particles and Rotational Motion', 'Gravitation', 'Mechanical Properties of Solids', 'Mechanical Properties of Fluids',
    'Thermal Properties of Matter', 'Thermodynamics', 'Kinetic Theory', 'Oscillations', 'Waves',
  ],
  '12': [
    'Electric Charges and Fields', 'Electrostatic Potential and Capacitance', 'Current Electricity', 'Moving Charges and Magnetism',
    'Magnetism and Matter', 'Electromagnetic Induction', 'Alternating Current', 'Electromagnetic Waves', 'Ray Optics and Optical Instruments',
    'Wave Optics', 'Dual Nature of Radiation and Matter', 'Atoms', 'Nuclei', 'Semiconductor Electronics',
  ],
};

const CHEMISTRY: Book = {
  '11': [
    'Some Basic Concepts of Chemistry', 'Structure of Atom', 'Classification of Elements and Periodicity in Properties',
    'Chemical Bonding and Molecular Structure', 'Thermodynamics', 'Equilibrium', 'Redox Reactions',
    'Organic Chemistry: Some Basic Principles and Techniques', 'Hydrocarbons',
  ],
  '12': [
    'Solutions', 'Electrochemistry', 'Chemical Kinetics', 'The d- and f-Block Elements', 'Coordination Compounds',
    'Haloalkanes and Haloarenes', 'Alcohols, Phenols and Ethers', 'Aldehydes, Ketones and Carboxylic Acids', 'Amines', 'Biomolecules',
  ],
};

const MATHS: Book = {
  '11': [
    'Sets', 'Relations and Functions', 'Trigonometric Functions', 'Complex Numbers and Quadratic Equations', 'Linear Inequalities',
    'Permutations and Combinations', 'Binomial Theorem', 'Sequences and Series', 'Straight Lines', 'Conic Sections',
    'Introduction to Three Dimensional Geometry', 'Limits and Derivatives', 'Statistics', 'Probability',
  ],
  '12': [
    'Relations and Functions', 'Inverse Trigonometric Functions', 'Matrices', 'Determinants', 'Continuity and Differentiability',
    'Application of Derivatives', 'Integrals', 'Application of Integrals', 'Differential Equations', 'Vector Algebra',
    'Three Dimensional Geometry', 'Linear Programming', 'Probability',
  ],
};

const BIOLOGY: Book = {
  '11': [
    'The Living World', 'Biological Classification', 'Plant Kingdom', 'Animal Kingdom', 'Morphology of Flowering Plants',
    'Anatomy of Flowering Plants', 'Structural Organisation in Animals', 'Cell: The Unit of Life', 'Biomolecules',
    'Cell Cycle and Cell Division', 'Photosynthesis in Higher Plants', 'Respiration in Plants', 'Plant Growth and Development',
    'Breathing and Exchange of Gases', 'Body Fluids and Circulation', 'Excretory Products and their Elimination',
    'Locomotion and Movement', 'Neural Control and Coordination', 'Chemical Coordination and Integration',
  ],
  '12': [
    'Sexual Reproduction in Flowering Plants', 'Human Reproduction', 'Reproductive Health', 'Principles of Inheritance and Variation',
    'Molecular Basis of Inheritance', 'Evolution', 'Human Health and Disease', 'Microbes in Human Welfare',
    'Biotechnology: Principles and Processes', 'Biotechnology and its Applications', 'Organisms and Populations', 'Ecosystem',
    'Biodiversity and Conservation',
  ],
};

// JEE Main also covers p-block elements in Inorganic Chemistry (not in the rationalised NCERT Class 12 book)
const JEE_EXTRA_CHEM: Record<Cls, string[]> = { '11': [], '12': ['p-Block Elements (Groups 13–18)'] };

type SubjectDef = { name: string; book: Book; extra?: Record<Cls, string[]> };

export interface SyllabusTemplate {
  id: string;
  title: string;
  description: string;
  exam: 'jee' | 'board' | 'both' | 'other';
  classes: Cls[];
  subjects: SubjectDef[];
}

const PCM: SubjectDef[] = [
  { name: 'Physics', book: PHYSICS },
  { name: 'Chemistry', book: CHEMISTRY },
  { name: 'Mathematics', book: MATHS },
];
const PCB: SubjectDef[] = [
  { name: 'Physics', book: PHYSICS },
  { name: 'Chemistry', book: CHEMISTRY },
  { name: 'Biology', book: BIOLOGY },
];

export const TEMPLATES: SyllabusTemplate[] = [
  {
    id: 'jee',
    title: 'JEE Main (PCM)',
    description: 'Class 11 + 12 Physics, Chemistry, Maths (NCERT chapters + p-block)',
    exam: 'jee',
    classes: ['11', '12'],
    subjects: [PCM[0], { ...PCM[1], extra: JEE_EXTRA_CHEM }, PCM[2]],
  },
  { id: 'neet', title: 'NEET (PCB)', description: 'Class 11 + 12 Physics, Chemistry, Biology (NCERT chapters)', exam: 'other', classes: ['11', '12'], subjects: PCB },
  { id: 'cbse12-pcm', title: 'CBSE Class 12 — PCM', description: 'Central board, Science (Maths)', exam: 'board', classes: ['12'], subjects: PCM },
  { id: 'cbse12-pcb', title: 'CBSE Class 12 — PCB', description: 'Central board, Science (Biology)', exam: 'board', classes: ['12'], subjects: PCB },
  { id: 'cbse11-pcm', title: 'CBSE Class 11 — PCM', description: 'Central board, Science (Maths)', exam: 'board', classes: ['11'], subjects: PCM },
  { id: 'cbse11-pcb', title: 'CBSE Class 11 — PCB', description: 'Central board, Science (Biology)', exam: 'board', classes: ['11'], subjects: PCB },
  { id: 'up12-pcm', title: 'UP Board Class 12 — PCM', description: 'State board (NCERT books)', exam: 'board', classes: ['12'], subjects: PCM },
  { id: 'up12-pcb', title: 'UP Board Class 12 — PCB', description: 'State board (NCERT books)', exam: 'board', classes: ['12'], subjects: PCB },
  { id: 'state12-pcm', title: 'Other State Board 12 — PCM', description: 'For NCERT-based state boards', exam: 'board', classes: ['12'], subjects: PCM },
  { id: 'state12-pcb', title: 'Other State Board 12 — PCB', description: 'For NCERT-based state boards', exam: 'board', classes: ['12'], subjects: PCB },
];

/** Adds subjects (re-using existing ones by name) and any chapters not already present. Returns chapters added. */
export async function applyTemplate(t: SyllabusTemplate): Promise<number> {
  const { data: existing, error } = await supabase.from('subjects').select('id,name').is('deleted_at', null);
  if (error) throw error;
  const subjectIds: Record<string, string> = {};
  for (const s of t.subjects) {
    const found = (existing ?? []).find((x: any) => x.name.toLowerCase() === s.name.toLowerCase());
    if (found) subjectIds[s.name] = found.id;
    else {
      const { data, error: e2 } = await supabase.from('subjects').insert({ name: s.name, exam: t.exam === 'other' ? 'other' : t.exam }).select('id').single();
      if (e2) throw e2;
      subjectIds[s.name] = (data as any).id;
    }
  }
  const { data: chs, error: e3 } = await supabase.from('chapters').select('name,subject_id,class_level').is('deleted_at', null);
  if (e3) throw e3;
  const have = new Set((chs ?? []).map((c: any) => `${c.subject_id}|${c.class_level}|${c.name.toLowerCase()}`));
  const rows: { subject_id: string; name: string; class_level: Cls }[] = [];
  for (const s of t.subjects)
    for (const cls of t.classes)
      for (const name of [...s.book[cls], ...(s.extra?.[cls] ?? [])]) {
        const key = `${subjectIds[s.name]}|${cls}|${name.toLowerCase()}`;
        if (!have.has(key)) rows.push({ subject_id: subjectIds[s.name], name, class_level: cls });
      }
  if (rows.length) {
    const { error: e4 } = await supabase.from('chapters').insert(rows);
    if (e4) throw e4;
  }
  invalidateLookups();
  return rows.length;
}
