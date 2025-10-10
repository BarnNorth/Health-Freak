# Custom Fonts Directory

## How to Add Custom Fonts

1. **Download your font files** (`.ttf` or `.otf` format)
2. **Place them in this directory** with descriptive names
3. **Update `app/_layout.tsx`** to load the fonts
4. **Use in your styles** with the font family name

## Example Font Files:
- `MyCustomFont-Regular.ttf`
- `MyCustomFont-Bold.ttf`
- `MyCustomFont-Italic.ttf`

## Example Usage in `app/_layout.tsx`:
```typescript
const [customFontsLoaded] = useCustomFonts({
  'MyCustomFont-Regular': require('./assets/fonts/MyCustomFont-Regular.ttf'),
  'MyCustomFont-Bold': require('./assets/fonts/MyCustomFont-Bold.ttf'),
});
```

## Example Usage in Styles:
```typescript
const styles = StyleSheet.create({
  text: {
    fontFamily: 'MyCustomFont-Regular',
    fontSize: 16,
  },
  boldText: {
    fontFamily: 'MyCustomFont-Bold',
    fontSize: 18,
  },
});
```

