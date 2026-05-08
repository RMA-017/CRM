import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { fetchPublicSiteContent } from "../lib/site-content.js";

const BLOG_TEXT = {
  uz: {
    backHome: "Bosh sahifaga qaytish",
    blog: "Blog",
    notFound: "Maqola topilmadi.",
    defaultTitle: "Aaron Academy Kids blog",
    defaultDescription: "Aaron Academy Kids blog maqolasi"
  },
  ru: {
    backHome: "Вернуться на главную",
    blog: "Блог",
    notFound: "Статья не найдена.",
    defaultTitle: "Блог Aaron Academy Kids",
    defaultDescription: "Статья блога Aaron Academy Kids"
  }
};

function getArticleId(slug = "") {
  const match = String(slug || "").match(/^(\d+)/);
  return match ? match[1] : "";
}

function localizeArticle(item, language) {
  const suffix = language === "ru" ? "Ru" : "Uz";
  return {
    ...item,
    title: item?.[`name${suffix}`] || item?.name || "",
    description: item?.[`description${suffix}`] || item?.description || ""
  };
}

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
}

function BlogArticlePage() {
  const { slug } = useParams();
  const { language, setLanguage } = useI18n();
  const text = BLOG_TEXT[language] || BLOG_TEXT.uz;
  const [articles, setArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const articleId = getArticleId(slug);

  useEffect(() => {
    let active = true;
    async function loadArticles() {
      try {
        const items = await fetchPublicSiteContent();
        if (active) {
          setArticles(Array.isArray(items.blog) ? items.blog : []);
        }
      } catch {
        if (active) {
          setArticles([]);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadArticles();
    return () => {
      active = false;
    };
  }, []);

  const article = useMemo(() => {
    const item = articles.find((entry) => String(entry.id) === articleId);
    return item ? localizeArticle(item, language) : null;
  }, [articleId, articles, language]);

  useEffect(() => {
    const title = article?.title
      ? `${article.title} | Aaron Academy Kids`
      : text.defaultTitle;
    const description = article?.description || text.defaultDescription;
    document.title = title;
    upsertMeta('meta[name="description"]', {
      name: "description",
      content: description
    });
    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: title
    });
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: description
    });
    upsertMeta('meta[property="og:type"]', {
      property: "og:type",
      content: "article"
    });
    upsertMeta('meta[property="og:locale"]', {
      property: "og:locale",
      content: language === "ru" ? "ru_RU" : "uz_UZ"
    });

    let structuredData = document.getElementById("blog-article-jsonld");
    if (!structuredData) {
      structuredData = document.createElement("script");
      structuredData.id = "blog-article-jsonld";
      structuredData.type = "application/ld+json";
      document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article?.title || title,
      description,
      image: article?.image || `${window.location.origin}/crm.svg`,
      author: {
        "@type": "Organization",
        name: "Aaron Academy Kids"
      },
      publisher: {
        "@type": "Organization",
        name: "Aaron Academy Kids",
        logo: {
          "@type": "ImageObject",
          url: `${window.location.origin}/crm.svg`
        }
      },
      datePublished: article?.createdAt || undefined,
      dateModified: article?.updatedAt || article?.createdAt || undefined,
      inLanguage: language === "ru" ? "ru" : "uz",
      mainEntityOfPage: window.location.href
    });
  }, [article, language, text.defaultDescription, text.defaultTitle]);

  return (
    <div className="home-layout home-site-layout blog-page-layout">
      <header className="home-header">
        <div className="home-header-inner">
          <Link className="brand" to="/" aria-label="AARON CRM home">
            <img src="/crm.svg" alt="AARON CRM logo" className="brand-logo-image" />
            <span className="brand-text">AARON</span>
          </Link>
          <button
            type="button"
            className="header-btn"
            onClick={() => setLanguage(language === "ru" ? "uz" : "ru")}
          >
            {language === "ru" ? "UZ" : "RU"}
          </button>
        </div>
      </header>

      <main className="home-main blog-page-main" aria-label={text.blog}>
        <article className="blog-article">
          <Link className="blog-back-link" to="/">
            ← {text.backHome}
          </Link>

          {isLoading ? (
            <p className="home-empty-message">Loading...</p>
          ) : article ? (
            <>
              <p className="home-section-kicker">{text.blog}</p>
              <h1>{article.title}</h1>
              {article.image ? <img className="blog-article-image" src={article.image} alt={article.title} /> : null}
              <div className="blog-article-body">
                {String(article.description || "")
                  .split(/\n{2,}/)
                  .map((paragraph) => paragraph.trim())
                  .filter(Boolean)
                  .map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
              </div>
            </>
          ) : (
            <p className="home-empty-message">{text.notFound}</p>
          )}
        </article>
      </main>
    </div>
  );
}

export default BlogArticlePage;
