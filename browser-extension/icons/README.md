# Extension Icons

This directory should contain three icon files:
- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon48.png` - 48x48 pixels (extension management)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Creating Icons

You can create these icons using:
1. **Design tool** (Figma, Sketch, Adobe Illustrator)
2. **Image editor** (Photoshop, GIMP)
3. **Online tool** (favicon.io, iconifier.net)
4. **Python script** (if PIL/Pillow is installed)

### Quick Python Script

```python
from PIL import Image, ImageDraw, ImageFont

sizes = [16, 48, 128]
for size in sizes:
    img = Image.new('RGB', (size, size), color='#3b82f6')
    draw = ImageDraw.Draw(img)
    # Add your logo/text here
    img.save(f'icon{size}.png')
```

### Design Guidelines

- Use Hi World branding colors (#3b82f6 blue)
- Keep design simple and recognizable at small sizes
- Ensure good contrast for visibility
- Consider using "HW" initials or a simple icon

## Placeholder

Until icons are created, the extension will show default browser icons.
The extension will still function correctly without custom icons.

