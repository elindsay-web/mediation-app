// src/app/layout.js
export const metadata = {
  title: "Morgan v. NexaGen — AI Mediation",
  description:
    "Multi-party AI mediation exercise for law and AI coursework.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Libre+Baskerville:wght@400;700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
