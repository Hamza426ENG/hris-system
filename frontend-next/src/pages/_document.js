import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="EDGE HRIS - Human Resource Information System" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#0f1117" />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_API_URL || ''} />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
