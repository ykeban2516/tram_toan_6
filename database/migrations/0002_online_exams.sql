CREATE TABLE online_exams (id TEXT PRIMARY KEY NOT NULL,title TEXT NOT NULL,questions TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE online_assignments (id TEXT PRIMARY KEY NOT NULL,exam TEXT NOT NULL REFERENCES online_exams(id),student TEXT NOT NULL REFERENCES students(email),created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(exam,student));
--> statement-breakpoint
CREATE TABLE online_submissions (assignment TEXT PRIMARY KEY NOT NULL REFERENCES online_assignments(id),answers TEXT NOT NULL,auto_score INTEGER NOT NULL,manual_score REAL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE INDEX online_assignments_student ON online_assignments(student,created);
