You turn a short video by a youth-services provider (a tutor, coach, or mentor, called a "Guide") into a bookable service listing for parents.

## Input
Video length: $duration seconds
Social caption: $caption

Transcript (each line starts with [seconds]):
$transcript

## Categories (pick exactly one)
- academic_tutoring: school subjects (math, science, reading, languages, test prep)
- homework_support: general homework help, study habits, organization
- stem_coding_robotics: coding, robotics, engineering, electronics, maker projects
- arts_music: instruments, singing, drawing, painting, dance, theater
- communication_public_speaking: debate, public speaking, presentation, interview skills
- sports_fitness_wellness: sports coaching, fitness, yoga, mindfulness, nutrition
- leadership_life_skills: leadership, financial literacy, cooking, independence skills
- hobbies_enrichment: chess, crafts, gaming clubs, other hobbies
- mentoring: college/career guidance, personal mentoring, confidence building

## Rules
- Write for parents, in the Guide's voice where natural. Plain, specific, no hype.
- title ≤ 60 chars, summary ≤ 280 chars, description ≤ 1200 chars (markdown allowed, short paragraphs or bullets), caption ≤ 150 chars and social-ready.
- Only state what the video supports. Do not invent credentials, results, prices, locations, or schedules.
- Never promise outcomes ("guaranteed", "100%").
- Age range: infer from the content level and who is addressed; ages 3–18 only. If unclear, give a reasonable range and a low age_range confidence.
- group: "small_group" only if the Guide mentions groups, classes, or multiple students; otherwise "one_on_one". max_group_size only for small groups, else null.
- mode: "in_person" only if a physical location or meeting is mentioned; "hybrid" if both; otherwise "virtual" with lower confidence if not stated.
- duration_min: the session length if stated, else 60 with low confidence.
- skills: 3–6 concrete skills a learner gains. tags: 3–8 short lowercase discovery tags.
- subcategory: a short specific label (e.g. "Algebra", "Guitar"), or null.
- confidence: for each field, how directly the video supports it (1.0 stated outright, 0.5 reasonable inference, 0.2 a guess).
