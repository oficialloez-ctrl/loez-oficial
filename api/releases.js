// Catálogo LOEZ. Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET na Vercel.
// O Spotify é consultado pelo servidor; credenciais não são enviadas ao navegador.
const ARTIST_ID = '6dl2N1fEzJjBRmLcF1Xfb0';
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'method_not_allowed' });
  }
  const id=process.env.SPOTIFY_CLIENT_ID, secret=process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return res.status(503).json({ error:'spotify_not_configured', releases:[] });
  try {
    const credential=Buffer.from(id+':'+secret).toString('base64');
    const tokenRes=await fetch('https://accounts.spotify.com/api/token',{
      method:'POST',headers:{Authorization:'Basic '+credential,'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=client_credentials',signal:AbortSignal.timeout(9000)
    });
    if(!tokenRes.ok) throw new Error('spotify_token_'+tokenRes.status);
    const token=(await tokenRes.json()).access_token;
    if(!token) throw new Error('spotify_token_empty');
    let next='https://api.spotify.com/v1/artists/'+ARTIST_ID+'/albums?include_groups=album,single,appears_on&market=BR&limit=50';
    const all=[];
    for(let page=0;page<4&&next;page++){
      const response=await fetch(next,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(9000)});
      if(!response.ok) throw new Error('spotify_catalog_'+response.status);
      const data=await response.json();
      all.push(...(Array.isArray(data.items)?data.items:[]));
      next=typeof data.next==='string'&&data.next.startsWith('https://api.spotify.com/v1/artists/')?data.next:null;
    }
    const seen=new Set(), today=new Date().toISOString().slice(0,10);
    const releases=all
      .filter(a=>a&&a.id&&a.name&&a.release_date&&a.release_date.slice(0,10)<=today)
      .sort((a,b)=>String(b.release_date).localeCompare(String(a.release_date)))
      .filter(a=>{
        const key=a.name.toLowerCase().trim()+':'+a.release_date;
        if(seen.has(key))return false;seen.add(key);return true;
      })
      .slice(0,6)
      .map(a=>({
        title:a.name,date:a.release_date,
        url:(a.external_urls&&a.external_urls.spotify)||('https://open.spotify.com/album/'+a.id),
        cover:(a.images&&a.images[0]&&a.images[0].url)||''
      }));
    return res.status(200).json({releases,checkedAt:new Date().toISOString()});
  }catch(error){
    console.error('LOEZ Spotify releases:',error.message);
    return res.status(503).json({error:'spotify_temporarily_unavailable',releases:[]});
  }
};
