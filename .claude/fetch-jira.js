const https = require('https');
const issue = process.argv[2];
const auth = Buffer.from(process.env.JIRA_EMAIL + ':' + process.env.JIRA_TOKEN).toString('base64');
const url = 'https://ejdetheije.atlassian.net/rest/api/3/issue/' + issue;

https.get(url, { headers: { Authorization: 'Basic ' + auth, Accept: 'application/json' } }, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const f = JSON.parse(body).fields;
    function text(nodes) {
      return (nodes || []).flatMap(b => {
        if (b.type === 'paragraph') return [(b.content||[]).filter(n=>n.type==='text').map(n=>n.text).join('')];
        if (b.type === 'bulletList') return (b.content||[]).flatMap(i=>(i.content||[]).map(p=>' - '+(p.content||[]).filter(n=>n.type==='text').map(n=>n.text).join('')));
        if (b.type === 'heading') return ['## '+(b.content||[]).filter(n=>n.type==='text').map(n=>n.text).join('')];
        if (b.type === 'codeBlock') return ['```\n'+(b.content||[]).map(n=>n.text).join('')+'\n```'];
        return [];
      }).filter(Boolean).join('\n');
    }
    console.log('SUMMARY:', f.summary);
    console.log('STATUS:', f.status.name);
    console.log('PRIORITY:', f.priority?.name || 'N/A');
    console.log('DESCRIPTION:\n' + text(f.description?.content));
    const comments = (f.comment?.comments || []).map(c => c.author.displayName + ': ' + text(c.body?.content)).join('\n');
    if (comments) console.log('COMMENTS:\n' + comments);
  });
});
