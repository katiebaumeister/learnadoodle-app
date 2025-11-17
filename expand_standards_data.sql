-- Expanded Standards Data
-- Adds standards for K-12 grades and multiple subjects (Math, ELA, Science, Social Studies)
-- Focuses on common states: CA, VA, GA, TX, NY, FL
-- This is a representative sample - full production would import from official sources

-- ============================================================================
-- CALIFORNIA (CA) - Common Core Standards
-- ============================================================================

-- CA Math Standards (K-12 sample)
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
-- Kindergarten
('CA', 'K', 'Math', 'Counting and Cardinality', 'K.CC.1', 'Count to 100 by ones and by tens', 3, 'beginner'),
('CA', 'K', 'Math', 'Counting and Cardinality', 'K.CC.2', 'Count forward from a given number', 2, 'beginner'),
('CA', 'K', 'Math', 'Operations and Algebraic Thinking', 'K.OA.1', 'Represent addition and subtraction with objects', 4, 'beginner'),
('CA', 'K', 'Math', 'Number and Operations', 'K.NBT.1', 'Compose and decompose numbers from 11 to 19', 3, 'beginner'),
-- Grade 1
('CA', '1', 'Math', 'Operations and Algebraic Thinking', '1.OA.1', 'Use addition and subtraction within 20 to solve word problems', 5, 'beginner'),
('CA', '1', 'Math', 'Number and Operations', '1.NBT.1', 'Count to 120, starting at any number', 3, 'beginner'),
('CA', '1', 'Math', 'Measurement and Data', '1.MD.1', 'Order three objects by length', 2, 'beginner'),
-- Grade 2
('CA', '2', 'Math', 'Operations and Algebraic Thinking', '2.OA.1', 'Use addition and subtraction within 100 to solve word problems', 6, 'intermediate'),
('CA', '2', 'Math', 'Number and Operations', '2.NBT.1', 'Understand place value', 4, 'intermediate'),
-- Grade 3
('CA', '3', 'Math', 'Operations and Algebraic Thinking', '3.OA.1', 'Interpret products of whole numbers', 4, 'intermediate'),
('CA', '3', 'Math', 'Number and Operations', '3.NBT.1', 'Use place value understanding to round whole numbers', 3, 'intermediate'),
-- Grade 4 (already seeded, but adding more)
('CA', '4', 'Math', 'Number and Operations—Fractions', '4.NF.3', 'Understand a fraction a/b with a > 1 as a sum of fractions 1/b', 5, 'intermediate'),
('CA', '4', 'Math', 'Measurement and Data', '4.MD.2', 'Use the four operations to solve word problems involving distances', 4, 'intermediate'),
-- Grade 5
('CA', '5', 'Math', 'Number and Operations', '5.NBT.1', 'Recognize that in a multi-digit number, a digit represents 10 times what it represents to its right', 3, 'intermediate'),
('CA', '5', 'Math', 'Number and Operations—Fractions', '5.NF.1', 'Add and subtract fractions with unlike denominators', 6, 'intermediate'),
('CA', '5', 'Math', 'Geometry', '5.G.1', 'Use a pair of perpendicular number lines to define a coordinate system', 4, 'intermediate'),
-- Grade 6
('CA', '6', 'Math', 'Ratios and Proportional Relationships', '6.RP.1', 'Understand the concept of a ratio', 4, 'intermediate'),
('CA', '6', 'Math', 'The Number System', '6.NS.1', 'Interpret and compute quotients of fractions', 5, 'intermediate'),
('CA', '6', 'Math', 'Expressions and Equations', '6.EE.1', 'Write and evaluate numerical expressions involving whole-number exponents', 4, 'intermediate'),
-- Grade 7
('CA', '7', 'Math', 'Ratios and Proportional Relationships', '7.RP.1', 'Compute unit rates associated with ratios of fractions', 5, 'intermediate'),
('CA', '7', 'Math', 'The Number System', '7.NS.1', 'Apply and extend previous understandings of addition and subtraction', 5, 'intermediate'),
('CA', '7', 'Math', 'Expressions and Equations', '7.EE.1', 'Use properties of operations to generate equivalent expressions', 5, 'intermediate'),
-- Grade 8
('CA', '8', 'Math', 'The Number System', '8.NS.1', 'Know that numbers that are not rational are called irrational', 4, 'intermediate'),
('CA', '8', 'Math', 'Expressions and Equations', '8.EE.1', 'Know and apply the properties of integer exponents', 4, 'intermediate'),
('CA', '8', 'Math', 'Functions', '8.F.1', 'Understand that a function is a rule that assigns to each input exactly one output', 5, 'intermediate'),
-- High School (9-12) - Algebra
('CA', '9', 'Math', 'Algebra', 'A-SSE.1', 'Interpret expressions that represent a quantity in terms of its context', 6, 'advanced'),
('CA', '9', 'Math', 'Algebra', 'A-APR.1', 'Understand that polynomials form a system analogous to the integers', 6, 'advanced'),
('CA', '10', 'Math', 'Algebra', 'A-CED.1', 'Create equations and inequalities in one variable', 5, 'advanced'),
-- High School - Geometry
('CA', '10', 'Math', 'Geometry', 'G-CO.1', 'Know precise definitions of angle, circle, perpendicular line, parallel line', 4, 'advanced'),
('CA', '11', 'Math', 'Geometry', 'G-SRT.1', 'Verify experimentally the properties of dilations', 5, 'advanced'),
-- High School - Statistics
('CA', '12', 'Math', 'Statistics', 'S-ID.1', 'Represent data with plots on the real number line', 4, 'advanced'),
('CA', '12', 'Math', 'Statistics', 'S-IC.1', 'Understand statistics as a process for making inferences', 5, 'advanced')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- CA ELA Standards (K-12 sample)
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
-- Kindergarten
('CA', 'K', 'ELA', 'Reading Literature', 'K.RL.1', 'With prompting and support, ask and answer questions about key details', 3, 'beginner'),
('CA', 'K', 'ELA', 'Reading Informational', 'K.RI.1', 'With prompting and support, ask and answer questions about key details', 3, 'beginner'),
('CA', 'K', 'ELA', 'Foundational Skills', 'K.RF.1', 'Demonstrate understanding of the organization and basic features of print', 2, 'beginner'),
-- Grade 1
('CA', '1', 'ELA', 'Reading Literature', '1.RL.1', 'Ask and answer questions about key details in a text', 4, 'beginner'),
('CA', '1', 'ELA', 'Writing', '1.W.1', 'Write opinion pieces in which they introduce the topic', 5, 'beginner'),
-- Grade 2
('CA', '2', 'ELA', 'Reading Literature', '2.RL.1', 'Ask and answer such questions as who, what, where, when, why', 4, 'intermediate'),
('CA', '2', 'ELA', 'Writing', '2.W.1', 'Write opinion pieces in which they introduce the topic', 6, 'intermediate'),
-- Grade 3
('CA', '3', 'ELA', 'Reading Literature', '3.RL.1', 'Ask and answer questions to demonstrate understanding', 5, 'intermediate'),
('CA', '3', 'ELA', 'Writing', '3.W.1', 'Write opinion pieces on topics or texts', 8, 'intermediate'),
-- Grade 4 (already seeded, adding more)
('CA', '4', 'ELA', 'Reading Literature', '4.RL.3', 'Describe in depth a character, setting, or event', 5, 'intermediate'),
('CA', '4', 'ELA', 'Speaking and Listening', '4.SL.1', 'Engage effectively in a range of collaborative discussions', 4, 'intermediate'),
-- Grade 5
('CA', '5', 'ELA', 'Reading Literature', '5.RL.1', 'Quote accurately from a text when explaining what the text says', 5, 'intermediate'),
('CA', '5', 'ELA', 'Writing', '5.W.1', 'Write opinion pieces on topics or texts', 10, 'intermediate'),
-- Grade 6
('CA', '6', 'ELA', 'Reading Literature', '6.RL.1', 'Cite textual evidence to support analysis', 6, 'intermediate'),
('CA', '6', 'ELA', 'Writing', '6.W.1', 'Write arguments to support claims', 10, 'intermediate'),
-- Grade 7
('CA', '7', 'ELA', 'Reading Literature', '7.RL.1', 'Cite several pieces of textual evidence', 6, 'intermediate'),
('CA', '7', 'ELA', 'Writing', '7.W.1', 'Write arguments to support claims', 12, 'intermediate'),
-- Grade 8
('CA', '8', 'ELA', 'Reading Literature', '8.RL.1', 'Cite the textual evidence that most strongly supports an analysis', 6, 'intermediate'),
('CA', '8', 'ELA', 'Writing', '8.W.1', 'Write arguments to support claims', 12, 'intermediate'),
-- High School (9-12)
('CA', '9', 'ELA', 'Reading Literature', '9-10.RL.1', 'Cite strong and thorough textual evidence', 8, 'advanced'),
('CA', '9', 'ELA', 'Writing', '9-10.W.1', 'Write arguments to support claims', 15, 'advanced'),
('CA', '11', 'ELA', 'Reading Literature', '11-12.RL.1', 'Cite strong and thorough textual evidence', 8, 'advanced'),
('CA', '11', 'ELA', 'Writing', '11-12.W.1', 'Write arguments to support claims', 15, 'advanced')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- CA Science Standards (K-12 sample)
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
-- Elementary
('CA', 'K', 'Science', 'Physical Sciences', 'K-PS.1', 'Plan and conduct investigations to describe different kinds of materials', 4, 'beginner'),
('CA', '1', 'Science', 'Life Sciences', '1-LS.1', 'Use materials to design a solution to a human problem', 4, 'beginner'),
('CA', '2', 'Science', 'Earth Sciences', '2-ESS.1', 'Use information from several sources to provide evidence', 4, 'beginner'),
('CA', '3', 'Science', 'Life Sciences', '3-LS.1', 'Develop models to describe that organisms have unique life cycles', 5, 'intermediate'),
('CA', '4', 'Science', 'Physical Sciences', '4-PS.1', 'Develop a model to describe that matter is made of particles', 5, 'intermediate'),
('CA', '5', 'Science', 'Earth Sciences', '5-ESS.1', 'Support an argument that differences in apparent brightness are due to distances', 5, 'intermediate'),
-- Middle School
('CA', '6', 'Science', 'Physical Sciences', 'MS-PS.1', 'Develop models to describe the atomic composition of simple molecules', 6, 'intermediate'),
('CA', '7', 'Science', 'Life Sciences', 'MS-LS.1', 'Conduct an investigation to provide evidence that living things are made of cells', 6, 'intermediate'),
('CA', '8', 'Science', 'Earth Sciences', 'MS-ESS.1', 'Develop and use a model of the Earth-sun-moon system', 6, 'intermediate'),
-- High School
('CA', '9', 'Science', 'Physical Sciences', 'HS-PS.1', 'Use the periodic table as a model to predict properties of elements', 8, 'advanced'),
('CA', '10', 'Science', 'Life Sciences', 'HS-LS.1', 'Construct an explanation based on evidence for how the structure of DNA', 8, 'advanced'),
('CA', '11', 'Science', 'Earth Sciences', 'HS-ESS.1', 'Develop a model based on evidence to illustrate the life span of the sun', 8, 'advanced')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- CA Social Studies Standards (K-12 sample)
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
-- Elementary
('CA', 'K', 'Social Studies', 'History', 'K-H.1', 'Understand that history relates to events, people, and places', 3, 'beginner'),
('CA', '1', 'Social Studies', 'History', '1-H.1', 'Students place important events in their lives in the order in which they occurred', 4, 'beginner'),
('CA', '2', 'Social Studies', 'Geography', '2-G.1', 'Students demonstrate map skills by describing the absolute and relative locations', 4, 'beginner'),
('CA', '3', 'Social Studies', 'History', '3-H.1', 'Research the explorers who came to California', 5, 'intermediate'),
('CA', '4', 'Social Studies', 'History', '4-H.1', 'Students demonstrate an understanding of the physical and human geographic features', 5, 'intermediate'),
('CA', '5', 'Social Studies', 'History', '5-H.1', 'Students describe the major pre-Columbian settlements', 5, 'intermediate'),
-- Middle School
('CA', '6', 'Social Studies', 'History', '6-H.1', 'Students analyze the geographic, political, economic, religious, and social structures', 6, 'intermediate'),
('CA', '7', 'Social Studies', 'History', '7-H.1', 'Students analyze the causes and effects of the vast expansion and ultimate disintegration', 6, 'intermediate'),
('CA', '8', 'Social Studies', 'History', '8-H.1', 'Students understand the major events preceding the founding of the nation', 6, 'intermediate'),
-- High School
('CA', '9', 'Social Studies', 'History', '9-H.1', 'Students analyze the significant events in the founding of the nation', 8, 'advanced'),
('CA', '10', 'Social Studies', 'History', '10-H.1', 'Students analyze the rise of totalitarian governments after World War I', 8, 'advanced'),
('CA', '11', 'Social Studies', 'History', '11-H.1', 'Students analyze the significant events in the founding of the nation', 8, 'advanced'),
('CA', '12', 'Social Studies', 'Government', '12-G.1', 'Students explain the fundamental principles and moral values of American democracy', 8, 'advanced')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- VIRGINIA (VA) Standards - Similar structure, different codes
-- ============================================================================

-- VA Math Standards (sample across grades)
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('VA', 'K', 'Math', 'Number and Number Sense', 'K.1', 'Tell how many are in a set of 20 or fewer objects', 3, 'beginner'),
('VA', '1', 'Math', 'Number and Number Sense', '1.1', 'Count forward orally by ones to 110, starting from any number', 3, 'beginner'),
('VA', '2', 'Math', 'Number and Number Sense', '2.1', 'Read, write, and identify the place value of each digit in a three-digit numeral', 3, 'intermediate'),
('VA', '3', 'Math', 'Number and Number Sense', '3.1', 'Read, write, and identify the place value of each digit in a six-digit whole number', 3, 'intermediate'),
-- Grade 4 already seeded
('VA', '5', 'Math', 'Number and Number Sense', '5.1', 'Read, write, and identify the place value of each digit in a nine-digit whole number', 3, 'intermediate'),
('VA', '6', 'Math', 'Number and Number Sense', '6.1', 'Identify representations of a given percent', 4, 'intermediate'),
('VA', '7', 'Math', 'Number and Number Sense', '7.1', 'Compare and order rational numbers', 4, 'intermediate'),
('VA', '8', 'Math', 'Number and Number Sense', '8.1', 'Simplify numerical expressions involving positive exponents', 4, 'intermediate'),
('VA', '9', 'Math', 'Algebra', 'A.1', 'The student will represent verbal quantitative situations algebraically', 6, 'advanced'),
('VA', '10', 'Math', 'Geometry', 'G.1', 'The student will construct and judge the validity of a logical argument', 6, 'advanced')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- VA ELA Standards (sample)
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('VA', 'K', 'ELA', 'Reading', 'K.4', 'The student will identify, say, segment, and blend various units of speech sounds', 4, 'beginner'),
('VA', '1', 'ELA', 'Reading', '1.4', 'The student will apply knowledge of how print is organized and read', 4, 'beginner'),
('VA', '2', 'ELA', 'Reading', '2.4', 'The student will use phonetic strategies when reading and spelling', 5, 'intermediate'),
('VA', '3', 'ELA', 'Reading', '3.4', 'The student will expand vocabulary when reading', 5, 'intermediate'),
-- Grade 4 already seeded
('VA', '5', 'ELA', 'Reading', '5.4', 'The student will expand vocabulary when reading', 6, 'intermediate'),
('VA', '6', 'ELA', 'Reading', '6.4', 'The student will read and determine the meanings of unfamiliar words', 6, 'intermediate'),
('VA', '7', 'ELA', 'Reading', '7.4', 'The student will read and determine the meanings of unfamiliar words', 6, 'intermediate'),
('VA', '8', 'ELA', 'Reading', '8.4', 'The student will apply knowledge of word origins, derivations, and inflections', 6, 'intermediate'),
('VA', '9', 'ELA', 'Reading', '9.4', 'The student will read, comprehend, and analyze a variety of literary texts', 8, 'advanced'),
('VA', '10', 'ELA', 'Reading', '10.4', 'The student will read, interpret, analyze, and evaluate texts', 8, 'advanced')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- GEORGIA (GA) Standards - Sample
-- ============================================================================

-- GA Math Standards (sample)
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('GA', 'K', 'Math', 'Number and Operations', 'K.NR.1', 'Count to 100 by ones and by tens', 3, 'beginner'),
('GA', '1', 'Math', 'Number and Operations', '1.NR.1', 'Extend the counting sequence to 120', 3, 'beginner'),
('GA', '2', 'Math', 'Number and Operations', '2.NR.1', 'Use place value understanding to determine if a one- or two-digit number', 4, 'intermediate'),
('GA', '3', 'Math', 'Number and Operations', '3.NR.1', 'Use place value reasoning to represent, read, and write numbers', 4, 'intermediate'),
-- Grade 4 already seeded
('GA', '5', 'Math', 'Number and Operations', '5.NR.1', 'Use place value understanding to solve problems', 4, 'intermediate'),
('GA', '6', 'Math', 'Number and Operations', '6.NR.1', 'Use reasoning about multiplication and division to solve ratio and rate problems', 5, 'intermediate'),
('GA', '7', 'Math', 'Number and Operations', '7.NR.1', 'Solve problems involving operations with rational numbers', 5, 'intermediate'),
('GA', '8', 'Math', 'Number and Operations', '8.NR.1', 'Solve problems involving irrational numbers', 5, 'intermediate')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- GA ELA Standards (sample)
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('GA', 'K', 'ELA', 'Reading Literary', 'K.RL.1', 'With prompting and support, ask and answer questions about key details', 3, 'beginner'),
('GA', '1', 'ELA', 'Reading Literary', '1.RL.1', 'Ask and answer questions about key details in a text', 4, 'beginner'),
('GA', '2', 'ELA', 'Reading Literary', '2.RL.1', 'Ask and answer such questions as who, what, where, when, why', 4, 'intermediate'),
('GA', '3', 'ELA', 'Reading Literary', '3.RL.1', 'Ask and answer questions to demonstrate understanding', 5, 'intermediate'),
-- Grade 4 already seeded
('GA', '5', 'ELA', 'Reading Literary', '5.RL.1', 'Quote accurately from a text when explaining what the text says', 5, 'intermediate'),
('GA', '6', 'ELA', 'Reading Literary', '6.RL.1', 'Cite textual evidence to support analysis', 6, 'intermediate'),
('GA', '7', 'ELA', 'Reading Literary', '7.RL.1', 'Cite several pieces of textual evidence', 6, 'intermediate'),
('GA', '8', 'ELA', 'Reading Literary', '8.RL.1', 'Cite the textual evidence that most strongly supports an analysis', 6, 'intermediate')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- TEXAS (TX) Standards - Sample
-- ============================================================================

INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
-- TX Math
('TX', 'K', 'Math', 'Number and Operations', 'K.2A', 'Count forward and backward to at least 20', 3, 'beginner'),
('TX', '1', 'Math', 'Number and Operations', '1.2A', 'Recognize instantly the quantity of structured arrangements', 3, 'beginner'),
('TX', '2', 'Math', 'Number and Operations', '2.2A', 'Use concrete and pictorial models to compose and decompose numbers', 4, 'intermediate'),
('TX', '3', 'Math', 'Number and Operations', '3.2A', 'Compose and decompose numbers up to 100,000', 4, 'intermediate'),
('TX', '4', 'Math', 'Number and Operations', '4.2A', 'Interpret the value of each place-value position', 4, 'intermediate'),
('TX', '5', 'Math', 'Number and Operations', '5.2A', 'Represent the value of the digit in decimals through the thousandths', 4, 'intermediate'),
-- TX ELA
('TX', 'K', 'ELA', 'Reading', 'K.2A', 'Demonstrate phonological awareness', 4, 'beginner'),
('TX', '1', 'ELA', 'Reading', '1.2A', 'Demonstrate phonological awareness', 4, 'beginner'),
('TX', '2', 'ELA', 'Reading', '2.2A', 'Demonstrate phonological awareness', 5, 'intermediate'),
('TX', '3', 'ELA', 'Reading', '3.2A', 'Demonstrate phonological awareness', 5, 'intermediate'),
('TX', '4', 'ELA', 'Reading', '4.2A', 'Demonstrate phonological awareness', 5, 'intermediate'),
('TX', '5', 'ELA', 'Reading', '5.2A', 'Demonstrate phonological awareness', 5, 'intermediate')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- NEW YORK (NY) Standards - Sample
-- ============================================================================

INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
-- NY Math
('NY', 'K', 'Math', 'Operations and Algebraic Thinking', 'K.OA.1', 'Represent addition and subtraction with objects', 3, 'beginner'),
('NY', '1', 'Math', 'Operations and Algebraic Thinking', '1.OA.1', 'Use addition and subtraction within 20', 4, 'beginner'),
('NY', '2', 'Math', 'Operations and Algebraic Thinking', '2.OA.1', 'Use addition and subtraction within 100', 5, 'intermediate'),
('NY', '3', 'Math', 'Operations and Algebraic Thinking', '3.OA.1', 'Interpret products of whole numbers', 5, 'intermediate'),
('NY', '4', 'Math', 'Operations and Algebraic Thinking', '4.OA.1', 'Interpret a multiplication equation as a comparison', 5, 'intermediate'),
('NY', '5', 'Math', 'Operations and Algebraic Thinking', '5.OA.1', 'Use parentheses, brackets, or braces in numerical expressions', 5, 'intermediate'),
-- NY ELA
('NY', 'K', 'ELA', 'Reading Literature', 'K.RL.1', 'With prompting and support, ask and answer questions', 3, 'beginner'),
('NY', '1', 'ELA', 'Reading Literature', '1.RL.1', 'Ask and answer questions about key details', 4, 'beginner'),
('NY', '2', 'ELA', 'Reading Literature', '2.RL.1', 'Ask and answer such questions as who, what, where, when, why', 4, 'intermediate'),
('NY', '3', 'ELA', 'Reading Literature', '3.RL.1', 'Ask and answer questions to demonstrate understanding', 5, 'intermediate'),
('NY', '4', 'ELA', 'Reading Literature', '4.RL.1', 'Refer to details and examples when explaining what the text says', 5, 'intermediate'),
('NY', '5', 'ELA', 'Reading Literature', '5.RL.1', 'Quote accurately from a text when explaining what the text says', 5, 'intermediate')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- FLORIDA (FL) Standards - Sample
-- ============================================================================

INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
-- FL Math
('FL', 'K', 'Math', 'Number Sense', 'MA.K.NSO.1', 'Count forward and backward within 20', 3, 'beginner'),
('FL', '1', 'Math', 'Number Sense', 'MA.1.NSO.1', 'Starting at a given number, count forward and backwards', 3, 'beginner'),
('FL', '2', 'Math', 'Number Sense', 'MA.2.NSO.1', 'Read and write numbers from 0 to 1,000', 4, 'intermediate'),
('FL', '3', 'Math', 'Number Sense', 'MA.3.NSO.1', 'Read and write numbers from 0 to 10,000', 4, 'intermediate'),
('FL', '4', 'Math', 'Number Sense', 'MA.4.NSO.1', 'Express how the value of a digit in a multi-digit whole number changes', 4, 'intermediate'),
('FL', '5', 'Math', 'Number Sense', 'MA.5.NSO.1', 'Express how the value of a digit in a multi-digit number changes', 4, 'intermediate'),
-- FL ELA
('FL', 'K', 'ELA', 'Reading', 'ELA.K.R.1', 'Identify and describe the main story elements', 3, 'beginner'),
('FL', '1', 'ELA', 'Reading', 'ELA.1.R.1', 'Identify and describe the main story elements', 4, 'beginner'),
('FL', '2', 'ELA', 'Reading', 'ELA.2.R.1', 'Identify and explain how text features contribute to meaning', 4, 'intermediate'),
('FL', '3', 'ELA', 'Reading', 'ELA.3.R.1', 'Identify and explain how text features contribute to meaning', 5, 'intermediate'),
('FL', '4', 'ELA', 'Reading', 'ELA.4.R.1', 'Explain how text features contribute to meaning', 5, 'intermediate'),
('FL', '5', 'ELA', 'Reading', 'ELA.5.R.1', 'Analyze how setting, characters, and plot contribute to meaning', 5, 'intermediate')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- Note: This is a representative sample. For full production:
-- 1. Import official standards from state education department websites
-- 2. Use standards APIs/services (e.g., Common Core, state-specific)
-- 3. Create bulk import scripts from CSV/JSON files
-- 4. Consider using AI/LLM to help structure and import standards data

