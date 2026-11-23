/**
 * Safely and quickly requests device coordinates via the HTML5 Geolocation API.
 * Uses a short timeout (default 2200ms) so authentication or navigation is never blocked
 * if the user has slow GPS or dismisses the prompt.
 */
export async function getClientCoordinates(timeoutMs = 2200) {
  if (typeof window === 'undefined' || !navigator?.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve(null);
      }
    }, timeoutMs);

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            const lat = Number(pos.coords.latitude.toFixed(5));
            const lng = Number(pos.coords.longitude.toFixed(5));
            resolve({
              latitude: lat,
              longitude: lng,
              coordinates: `${lat}, ${lng}`,
              accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
            });
          }
        },
        () => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve(null);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 60000,
        }
      );
    } catch {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}
