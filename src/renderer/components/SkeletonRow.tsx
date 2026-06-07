/**
 * SkeletonRow.tsx
 * Skeleton loading placeholder matching the repo table layout.
 * Renders 8 shimmer rows, each 48px tall.
 */

export default function SkeletonRow() {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {/* Rank column */}
          <td>
            <div className="skeleton skeleton-line" style={{ width: 20, height: 12, margin: "0 auto" }} />
          </td>
          {/* Repository column */}
          <td>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="skeleton skeleton-line" style={{ width: "60%", height: 13 }} />
              <div className="skeleton skeleton-line" style={{ width: "90%", height: 11 }} />
            </div>
          </td>
          {/* Category column */}
          <td>
            <div className="skeleton skeleton-line" style={{ width: 80, height: 12 }} />
          </td>
          {/* Stars column */}
          <td>
            <div className="skeleton skeleton-line" style={{ width: 40, height: 12, marginLeft: "auto" }} />
          </td>
          {/* Growth column */}
          <td>
            <div className="skeleton skeleton-line" style={{ width: 36, height: 12, marginLeft: "auto" }} />
          </td>
          {/* Score column */}
          <td>
            <div className="skeleton skeleton-line" style={{ width: 32, height: 12, marginLeft: "auto" }} />
          </td>
          {/* Sources column */}
          <td>
            <div className="skeleton skeleton-line" style={{ width: 20, height: 12, marginLeft: "auto" }} />
          </td>
          {/* Compare column */}
          <td>
            <div className="skeleton skeleton-circle" style={{ width: 24, height: 24, margin: "0 auto" }} />
          </td>
        </tr>
      ))}
    </tbody>
  );
}
