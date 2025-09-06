"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

interface MarkdownResponse {
  content: string;
}

const Home = () => {
  const [markdown, setMarkdown] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarkdown = async () => {
      try {
        const response = await axios.get<string>('http://localhost:8000/api/markdown/'); //MarkdownResponse
        setMarkdown(response.data); //.content
        console.log(response.data); //.content
      } catch (err) {
        setError('Failed to fetch Markdown content');
        console.error(err);
      }
    };

    fetchMarkdown();
  }, []);

  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }
  console.log(markdown);

  return (
    <div style={{ 
        padding: '20px', 
        maxWidth: '800px', 
        margin: '0 auto', 
        backgroundColor: 'black', 
        color: 'white',
        minHeight: '100vh' // Ensures the black background covers the entire viewport height
      }}>
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
};

export default Home;