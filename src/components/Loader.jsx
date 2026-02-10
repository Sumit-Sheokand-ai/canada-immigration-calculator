/**
 * 3D Perspective Text Loading Animation
 * Based on Uiverse.io element by andrew-manzyk (MIT License)
 * https://uiverse.io/andrew-manzyk/unlucky-mouse-21
 */
export default function Loader() {
  const slices = Array.from({ length: 9 });
  return (
    <div className="uv-loader">
      {slices.map((_, i) => (
        <div key={i} className="uv-text">
          <span>Loading</span>
        </div>
      ))}
      <div className="uv-line" />
    </div>
  );
}
