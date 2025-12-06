# Template Marketplace Implementation Guide

## Overview
Transform the template system into a marketplace where users can share, rate, and discover templates. Tutors can create premium sequences.

## Database Schema

### 1. Extend plan_templates table
```sql
-- Add marketplace fields to existing plan_templates table
ALTER TABLE plan_templates
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_cents integer DEFAULT 0, -- 0 = free, >0 = premium
  ADD COLUMN IF NOT EXISTS creator_name text, -- Display name of creator
  ADD COLUMN IF NOT EXISTS creator_role text, -- 'parent', 'tutor', 'system'
  ADD COLUMN IF NOT EXISTS download_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_average numeric(3,2) DEFAULT 0, -- 0-5 scale
  ADD COLUMN IF NOT EXISTS rating_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false, -- Featured templates
  ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false, -- Verified by admin
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preview_image_url text,
  ADD COLUMN IF NOT EXISTS long_description text;

-- Indexes for marketplace queries
CREATE INDEX IF NOT EXISTS plan_templates_public_idx ON plan_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS plan_templates_premium_idx ON plan_templates(is_premium) WHERE is_premium = true;
CREATE INDEX IF NOT EXISTS plan_templates_featured_idx ON plan_templates(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS plan_templates_rating_idx ON plan_templates(rating_average DESC, rating_count DESC);
CREATE INDEX IF NOT EXISTS plan_templates_downloads_idx ON plan_templates(download_count DESC);
CREATE INDEX IF NOT EXISTS plan_templates_tags_idx ON plan_templates USING GIN(tags);
```

### 2. Template reviews table
```sql
CREATE TABLE IF NOT EXISTS template_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES plan_templates(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id),
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  helpful_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(template_id, reviewer_id) -- One review per user per template
);

CREATE INDEX IF NOT EXISTS template_reviews_template_id_idx ON template_reviews(template_id);
CREATE INDEX IF NOT EXISTS template_reviews_rating_idx ON template_reviews(rating);

-- RLS policies
ALTER TABLE template_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public template reviews"
ON template_reviews FOR SELECT
TO authenticated
USING (true); -- Reviews are public

CREATE POLICY "Users can create reviews"
ON template_reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can update own reviews"
ON template_reviews FOR UPDATE
TO authenticated
USING (auth.uid() = reviewer_id)
WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can delete own reviews"
ON template_reviews FOR DELETE
TO authenticated
USING (auth.uid() = reviewer_id);
```

### 3. Template purchases table (for premium templates)
```sql
CREATE TABLE IF NOT EXISTS template_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES plan_templates(id),
  buyer_id uuid NOT NULL REFERENCES profiles(id),
  family_id uuid NOT NULL REFERENCES family(id),
  price_cents integer NOT NULL,
  purchased_at timestamptz DEFAULT now() NOT NULL,
  payment_method text, -- 'stripe', 'credits', 'free_trial'
  payment_id text, -- External payment ID
  UNIQUE(template_id, buyer_id, family_id) -- One purchase per family
);

CREATE INDEX IF NOT EXISTS template_purchases_buyer_idx ON template_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS template_purchases_template_idx ON template_purchases(template_id);
CREATE INDEX IF NOT EXISTS template_purchases_family_idx ON template_purchases(family_id);

-- RLS policies
ALTER TABLE template_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
ON template_purchases FOR SELECT
TO authenticated
USING (
  auth.uid() = buyer_id 
  OR is_family_member(family_id)
);

CREATE POLICY "Users can create purchases"
ON template_purchases FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = buyer_id AND is_family_member(family_id));
```

### 4. Template favorites table
```sql
CREATE TABLE IF NOT EXISTS template_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES plan_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(template_id, user_id)
);

CREATE INDEX IF NOT EXISTS template_favorites_user_idx ON template_favorites(user_id);
CREATE INDEX IF NOT EXISTS template_favorites_template_idx ON template_favorites(template_id);

-- RLS policies
ALTER TABLE template_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own favorites"
ON template_favorites FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

## Backend API Endpoints

### Template Marketplace Routes (`backend/routers/template_marketplace_routes.py`)

```python
@router.get("/marketplace/templates")
async def browse_templates(
    q: Optional[str] = None,  # Search query
    tags: Optional[List[str]] = None,  # Filter by tags
    subject: Optional[str] = None,
    grade_level: Optional[str] = None,
    is_premium: Optional[bool] = None,
    featured: Optional[bool] = None,
    sort: str = "popular",  # popular, newest, rating, downloads
    limit: int = 20,
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    """Browse public templates in marketplace"""
    # Query public templates with filters
    # Include user's purchase status
    # Return templates with ratings, reviews count, purchase status

@router.get("/marketplace/templates/{template_id}")
async def get_template_details(
    template_id: str,
    user: dict = Depends(get_current_user),
):
    """Get template details including reviews"""
    # Return template with:
    # - Full details
    # - Reviews (paginated)
    # - User's purchase status
    # - User's review (if exists)
    # - Similar templates

@router.post("/marketplace/templates/{template_id}/purchase")
async def purchase_template(
    template_id: str,
    payment_method: str = "credits",  # or "stripe"
    user: dict = Depends(get_current_user),
):
    """Purchase a premium template"""
    # Check if already purchased
    # Process payment
    # Create purchase record
    # Return success

@router.post("/marketplace/templates/{template_id}/reviews")
async def create_review(
    template_id: str,
    rating: int = Field(..., ge=1, le=5),
    review_text: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Create or update a template review"""
    # Upsert review
    # Recalculate template rating_average
    # Return review

@router.post("/marketplace/templates/{template_id}/favorite")
async def favorite_template(
    template_id: str,
    user: dict = Depends(get_current_user),
):
    """Add template to favorites"""

@router.delete("/marketplace/templates/{template_id}/favorite")
async def unfavorite_template(
    template_id: str,
    user: dict = Depends(get_current_user),
):
    """Remove template from favorites"""

@router.post("/marketplace/templates/{template_id}/publish")
async def publish_template(
    template_id: str,
    is_public: bool = True,
    is_premium: bool = False,
    price_cents: int = 0,
    user: dict = Depends(get_current_user),
):
    """Publish a template to marketplace"""
    # Verify user owns template
    # Set public/premium flags
    # Set creator info
    # Return updated template
```

## Frontend Components

### 1. Template Marketplace Page (`components/marketplace/TemplateMarketplace.js`)

```jsx
// Browse marketplace templates
// Features:
// - Search bar
// - Filter chips (subject, grade, free/premium, featured)
// - Sort dropdown (popular, newest, rating)
// - Template grid with cards
// - Infinite scroll
// - Featured section at top
```

### 2. Template Card (`components/marketplace/TemplateCard.js`)

```jsx
// Display template in marketplace
// Shows:
// - Preview image
// - Title & description
// - Creator name & badge
// - Rating stars & count
// - Price (Free or $X.XX)
// - Download count
// - Tags
// - Favorite button
// - "View Details" button
```

### 3. Template Details Modal (`components/marketplace/TemplateDetailsModal.js`)

```jsx
// Full template details
// Sections:
// - Header (image, title, creator, rating)
// - Description
// - Preview (units/lessons list)
// - Reviews section
// - Similar templates
// - Purchase/Apply button
```

### 4. Review Component (`components/marketplace/TemplateReview.js`)

```jsx
// Display and create reviews
// Features:
// - Star rating input
// - Review text area
// - Review list with pagination
// - Helpful button
// - Edit/delete own reviews
```

### 5. Publish Template Modal (`components/templates/PublishTemplateModal.js`)

```jsx
// Publish template to marketplace
// Fields:
// - Public/Private toggle
// - Premium toggle
// - Price input
// - Tags input
// - Preview image upload
// - Long description
// - Publish button
```

## User Flows

### Flow 1: Browse & Discover Templates
1. User navigates to Marketplace tab
2. Sees featured templates at top
3. Filters by subject/grade/tags
4. Sorts by popularity/rating/newest
5. Clicks template card → Opens details modal
6. Views preview, reviews, similar templates
7. Clicks "Apply Template" → Goes to apply wizard

### Flow 2: Purchase Premium Template
1. User finds premium template
2. Clicks "Purchase" button
3. Sees price and payment options
4. Selects payment method (credits or Stripe)
5. Confirms purchase
6. Template unlocked → Can apply to family
7. Appears in "My Purchases" section

### Flow 3: Create & Publish Template
1. User creates template in Templates page
2. Clicks "Publish to Marketplace"
3. Fills out marketplace details:
   - Public/Private
   - Premium/Free
   - Price (if premium)
   - Tags
   - Preview image
   - Description
4. Submits for review (if premium)
5. Template appears in marketplace
6. Receives notifications for downloads/reviews

### Flow 4: Rate & Review Template
1. User applies template to their family
2. After using it, navigates to template details
3. Clicks "Write Review"
4. Rates 1-5 stars
5. Writes review text
6. Submits review
7. Review appears in template details
8. Template rating updates automatically

## Visual Design

### Marketplace Page Layout
```
┌─────────────────────────────────────────────────┐
│ 🔍 Search Templates...                          │
├─────────────────────────────────────────────────┤
│ Filters: [All] [Math] [Science] [Free] [Premium]│
│ Sort: [Popular ▼]                              │
├─────────────────────────────────────────────────┤
│ ⭐ Featured Templates                           │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│ │ 📚  │ │ 🧪  │ │ 📖  │ │ 🎨  │              │
│ │ 4.8 │ │ 4.9 │ │ 4.7 │ │ 5.0 │              │
│ └─────┘ └─────┘ └─────┘ └─────┘              │
├─────────────────────────────────────────────────┤
│ All Templates (1,234)                          │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│ │Card │ │Card │ │Card │ │Card │              │
│ └─────┘ └─────┘ └─────┘ └─────┘              │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│ │Card │ │Card │ │Card │ │Card │              │
│ └─────┘ └─────┘ └─────┘ └─────┘              │
└─────────────────────────────────────────────────┘
```

### Template Card Design
```
┌─────────────────────────────┐
│ [Preview Image]            │
│                             │
├─────────────────────────────┤
│ Algebra Basics              │
│ by Tutor Sarah ⭐ Verified  │
│ ⭐⭐⭐⭐⭐ 4.8 (234)        │
│ 📥 1.2k downloads            │
│                             │
│ [Math] [Grade 6-8] [Free]  │
│                             │
│ [❤️ Favorite] [View]       │
└─────────────────────────────┘
```

## Implementation Steps

1. **Database Migration**
   - Add marketplace fields to `plan_templates`
   - Create `template_reviews` table
   - Create `template_purchases` table
   - Create `template_favorites` table
   - Add indexes

2. **Backend API**
   - Create `template_marketplace_routes.py`
   - Add browse/search endpoints
   - Add purchase endpoints
   - Add review endpoints
   - Add favorite endpoints

3. **Frontend Components**
   - Create `TemplateMarketplace` page
   - Create `TemplateCard` component
   - Create `TemplateDetailsModal`
   - Create review components
   - Create publish modal

4. **Integration**
   - Add Marketplace tab to navigation
   - Link from Templates page
   - Add "Publish" button to template editor
   - Add purchase flow

5. **Payment Integration** (if premium)
   - Stripe integration
   - Credits system
   - Purchase history

## Benefits

✅ **Network Effects** - Users create value for others
✅ **Monetization** - Tutors can earn from premium templates
✅ **Quality** - Ratings/reviews surface best templates
✅ **Discovery** - Users find templates they wouldn't create
✅ **Community** - Builds engaged user base

