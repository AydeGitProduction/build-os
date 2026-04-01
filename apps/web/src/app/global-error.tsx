'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            Application error
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', marginBottom: '16px' }}>
            A critical error occurred. Please refresh the page.
            {error.digest && (
              <>
                {' '}
                <br />
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Error ID: {error.digest}
                </span>
              </>
            )}
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
