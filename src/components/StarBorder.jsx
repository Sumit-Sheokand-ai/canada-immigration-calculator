/**
 * StarBorder – animated gradient border wrapper
 * Adapted from https://www.reactbits.dev/animations/star-border
 */
export default function StarBorder({
  as: Component = 'div',
  className = '',
  color = 'white',
  speed = '6s',
  children,
  ...rest
}) {
  return (
    <Component
      className={`star-border ${className}`}
      style={{ ...rest.style }}
      {...rest}
    >
      <div
        className="star-border__glow star-border__glow--bottom"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="star-border__glow star-border__glow--top"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div className="star-border__inner">{children}</div>
    </Component>
  );
}
