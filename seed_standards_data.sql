-- Seed Standards Data
-- Initial data for VA, GA, and CA 4th grade Math and ELA as examples
-- This demonstrates the structure - you can expand with full standards later

-- ============================================================================
-- VIRGINIA (VA) 4th Grade Math Standards (Sample)
-- ============================================================================
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('VA', '4', 'Math', 'Number and Number Sense', '4.1', 'Read, write, and identify the place value of each digit in a nine-digit whole number', 2, 'beginner'),
('VA', '4', 'Math', 'Number and Number Sense', '4.2', 'Compare and order whole numbers expressed through millions', 2, 'beginner'),
('VA', '4', 'Math', 'Number and Number Sense', '4.3', 'Round whole numbers expressed through millions to the nearest thousand, ten thousand, and hundred thousand', 3, 'intermediate'),
('VA', '4', 'Math', 'Computation and Estimation', '4.4', 'Estimate sums, differences, products, and quotients of whole numbers', 4, 'intermediate'),
('VA', '4', 'Math', 'Computation and Estimation', '4.5', 'Add and subtract with whole numbers', 5, 'intermediate'),
('VA', '4', 'Math', 'Computation and Estimation', '4.6', 'Multiply whole numbers, up to four digits by one digit and two digits by two digits', 6, 'intermediate'),
('VA', '4', 'Math', 'Computation and Estimation', '4.7', 'Divide whole numbers, finding quotients with and without remainders', 6, 'intermediate'),
('VA', '4', 'Math', 'Measurement', '4.8', 'Solve problems involving length, weight/mass, and liquid volume', 4, 'intermediate'),
('VA', '4', 'Math', 'Geometry', '4.10', 'Identify and describe points, lines, line segments, rays, and angles', 3, 'beginner'),
('VA', '4', 'Math', 'Geometry', '4.11', 'Identify and describe intersecting, parallel, and perpendicular lines', 3, 'intermediate'),
('VA', '4', 'Math', 'Probability and Statistics', '4.13', 'Create and solve single-step and multistep practical problems involving addition, subtraction, multiplication, and division with whole numbers', 5, 'advanced')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- VIRGINIA (VA) 4th Grade ELA Standards (Sample)
-- ============================================================================
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('VA', '4', 'ELA', 'Reading', '4.4', 'Read and demonstrate comprehension of fictional texts, literary nonfiction, and poetry', 20, 'intermediate'),
('VA', '4', 'ELA', 'Reading', '4.5', 'Read and demonstrate comprehension of nonfiction texts', 20, 'intermediate'),
('VA', '4', 'ELA', 'Reading', '4.6', 'Read and demonstrate comprehension of nonfiction texts', 15, 'intermediate'),
('VA', '4', 'ELA', 'Writing', '4.7', 'Write cohesively for a variety of purposes', 25, 'intermediate'),
('VA', '4', 'ELA', 'Writing', '4.8', 'Edit writing for capitalization, spelling, punctuation, sentence structure, and paragraphing', 10, 'beginner'),
('VA', '4', 'ELA', 'Research', '4.9', 'Find, evaluate, and select appropriate resources for a research product', 15, 'intermediate')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- GEORGIA (GA) 4th Grade Math Standards (Sample)
-- ============================================================================
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('GA', '4', 'Math', 'Number and Operations', '4.NR.1', 'Use place value reasoning to read, write, and compare multi-digit whole numbers', 3, 'beginner'),
('GA', '4', 'Math', 'Number and Operations', '4.NR.2', 'Use place value reasoning to represent, compare, and round multi-digit whole numbers', 3, 'beginner'),
('GA', '4', 'Math', 'Number and Operations', '4.NR.3', 'Solve problems involving multiplication and division of whole numbers', 8, 'intermediate'),
('GA', '4', 'Math', 'Number and Operations', '4.NR.4', 'Solve problems involving addition and subtraction of fractions with like denominators', 6, 'intermediate'),
('GA', '4', 'Math', 'Measurement and Data', '4.MDR.5', 'Solve problems involving measurement', 5, 'intermediate'),
('GA', '4', 'Math', 'Geometry', '4.GSR.6', 'Identify, describe, and classify geometric figures', 4, 'beginner'),
('GA', '4', 'Math', 'Geometry', '4.GSR.7', 'Solve problems involving area and perimeter', 5, 'intermediate')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- GEORGIA (GA) 4th Grade ELA Standards (Sample)
-- ============================================================================
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('GA', '4', 'ELA', 'Reading Literary', '4.RL.1', 'Read and comprehend literature, including stories, dramas, and poetry', 20, 'intermediate'),
('GA', '4', 'ELA', 'Reading Informational', '4.RI.1', 'Read and comprehend informational texts', 20, 'intermediate'),
('GA', '4', 'ELA', 'Writing', '4.W.1', 'Write opinion pieces on topics or texts, supporting a point of view with reasons', 15, 'intermediate'),
('GA', '4', 'ELA', 'Writing', '4.W.2', 'Write informative/explanatory texts to examine a topic', 15, 'intermediate'),
('GA', '4', 'ELA', 'Language', '4.L.1', 'Demonstrate command of the conventions of standard English grammar and usage', 10, 'beginner'),
('GA', '4', 'ELA', 'Language', '4.L.2', 'Demonstrate command of the conventions of standard English capitalization, punctuation, and spelling', 10, 'beginner')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- CALIFORNIA (CA) 4th Grade Math Standards (Sample - Common Core)
-- ============================================================================
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('CA', '4', 'Math', 'Operations and Algebraic Thinking', '4.OA.1', 'Interpret a multiplication equation as a comparison', 3, 'beginner'),
('CA', '4', 'Math', 'Operations and Algebraic Thinking', '4.OA.2', 'Multiply or divide to solve word problems involving multiplicative comparison', 4, 'intermediate'),
('CA', '4', 'Math', 'Number and Operations in Base Ten', '4.NBT.1', 'Recognize that in a multi-digit whole number, a digit in one place represents ten times what it represents in the place to its right', 2, 'beginner'),
('CA', '4', 'Math', 'Number and Operations in Base Ten', '4.NBT.2', 'Read and write multi-digit whole numbers using base-ten numerals, number names, and expanded form', 3, 'beginner'),
('CA', '4', 'Math', 'Number and Operations in Base Ten', '4.NBT.3', 'Use place value understanding to round multi-digit whole numbers to any place', 3, 'intermediate'),
('CA', '4', 'Math', 'Number and Operations—Fractions', '4.NF.1', 'Explain why a fraction a/b is equivalent to a fraction (n × a)/(n × b)', 4, 'intermediate'),
('CA', '4', 'Math', 'Number and Operations—Fractions', '4.NF.2', 'Compare two fractions with different numerators and different denominators', 4, 'intermediate'),
('CA', '4', 'Math', 'Measurement and Data', '4.MD.1', 'Know relative sizes of measurement units', 3, 'beginner'),
('CA', '4', 'Math', 'Geometry', '4.G.1', 'Draw points, lines, line segments, rays, angles, and perpendicular and parallel lines', 4, 'intermediate'),
('CA', '4', 'Math', 'Geometry', '4.G.2', 'Classify two-dimensional figures based on the presence or absence of parallel or perpendicular lines', 3, 'intermediate')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- ============================================================================
-- CALIFORNIA (CA) 4th Grade ELA Standards (Sample - Common Core)
-- ============================================================================
INSERT INTO standards (state_code, grade_level, subject, domain, standard_code, standard_text, estimated_hours, difficulty_level) VALUES
('CA', '4', 'ELA', 'Reading Literature', '4.RL.1', 'Refer to details and examples in a text when explaining what the text says explicitly', 5, 'intermediate'),
('CA', '4', 'ELA', 'Reading Literature', '4.RL.2', 'Determine a theme of a story, drama, or poem from details in the text', 6, 'intermediate'),
('CA', '4', 'ELA', 'Reading Informational', '4.RI.1', 'Refer to details and examples in a text when explaining what the text says explicitly', 5, 'intermediate'),
('CA', '4', 'ELA', 'Reading Informational', '4.RI.2', 'Determine the main idea of a text and explain how it is supported by key details', 6, 'intermediate'),
('CA', '4', 'ELA', 'Writing', '4.W.1', 'Write opinion pieces on topics or texts, supporting a point of view with reasons and information', 15, 'intermediate'),
('CA', '4', 'ELA', 'Writing', '4.W.2', 'Write informative/explanatory texts to examine a topic and convey ideas and information clearly', 15, 'intermediate'),
('CA', '4', 'ELA', 'Language', '4.L.1', 'Demonstrate command of the conventions of standard English grammar and usage', 10, 'beginner'),
('CA', '4', 'ELA', 'Language', '4.L.2', 'Demonstrate command of the conventions of standard English capitalization, punctuation, and spelling', 10, 'beginner')
ON CONFLICT (state_code, grade_level, subject, standard_code) DO NOTHING;

-- Note: This is a sample dataset. For production, you would want to:
-- 1. Import full standards from official state websites
-- 2. Use an API or data service that provides standards
-- 3. Create a script to bulk import standards from CSV/JSON files
-- 4. Add more grades (K-12) and subjects (Science, Social Studies, etc.)

