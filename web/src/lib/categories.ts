import {
  BookOpen,
  Compass,
  Cpu,
  Dumbbell,
  GraduationCap,
  HeartHandshake,
  Mic,
  Palette,
  Puzzle,
  type LucideIcon,
} from "lucide-react";

import { CategorySchema, type Category } from "@/lib/schema";

export const CATEGORIES: Record<Category, { label: string; icon: LucideIcon }> = {
  academic_tutoring: { label: "Academic tutoring", icon: GraduationCap },
  homework_support: { label: "Homework support", icon: BookOpen },
  stem_coding_robotics: { label: "STEM, coding & robotics", icon: Cpu },
  arts_music: { label: "Arts & music", icon: Palette },
  communication_public_speaking: { label: "Communication & public speaking", icon: Mic },
  sports_fitness_wellness: { label: "Sports, fitness & wellness", icon: Dumbbell },
  leadership_life_skills: { label: "Leadership & life skills", icon: Compass },
  hobbies_enrichment: { label: "Hobbies & enrichment", icon: Puzzle },
  mentoring: { label: "Mentoring", icon: HeartHandshake },
};

export const CATEGORY_OPTIONS = CategorySchema.options.map((value) => ({
  value,
  ...CATEGORIES[value],
}));
