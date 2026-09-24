// Fake Xtream Codes panel for the e2e suite: a small catalog, EPG, catch-up
// and real (ffmpeg-generated) media, so the app can be driven end to end
// without a real provider. Run: node e2e/mock-xtream.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import ffmpegPath from 'ffmpeg-static'

const PORT = Number(process.env.MOCK_PORT || 8790)
const USER = 'demo'
const PASS = 'demo123'
const here = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.join(here, 'fixtures')

// --- Media fixtures (generated once, cached in e2e/fixtures) ---
function ff(args) {
  execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}
function ensureFixtures() {
  const marker = path.join(FIX, 'done-v1')
  if (fs.existsSync(marker)) return
  fs.mkdirSync(path.join(FIX, 'multi'), { recursive: true })
  fs.mkdirSync(path.join(FIX, 'live'), { recursive: true })
  const src = ['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440']
  // 20s progressive mp4 (movies/episodes).
  ff([...src, '-t', '20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '25', '-c:a', 'aac', '-movflags', '+faststart', path.join(FIX, 'video.mp4')])
  // 20s muxed HLS in 2s segments: reused for the sliding "live" window and catch-up.
  ff([...src, '-t', '20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '50', '-sc_threshold', '0', '-c:a', 'aac',
    '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', '-hls_segment_filename', path.join(FIX, 'live', 'seg%d.ts'), path.join(FIX, 'live', 'index.m3u8')])
  // Multi-track HLS: video-only rendition + two alternate audio languages + WebVTT subtitles.
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25', '-t', '20', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '50', '-sc_threshold', '0',
    '-f', 'hls', '-hls_time', '4', '-hls_list_size', '0', '-hls_segment_filename', path.join(FIX, 'multi', 'v%d.ts'), path.join(FIX, 'multi', 'video.m3u8')])
  for (const [lang, freq] of [['por', 440], ['eng', 880]]) {
    ff(['-f', 'lavfi', '-i', `sine=frequency=${freq}`, '-t', '20', '-c:a', 'aac',
      '-f', 'hls', '-hls_time', '4', '-hls_list_size', '0', '-hls_segment_filename', path.join(FIX, 'multi', `a_${lang}%d.ts`), path.join(FIX, 'multi', `audio_${lang}.m3u8`)])
  }
  let vtt = 'WEBVTT\n\n'
  for (let i = 0; i < 10; i++) vtt += `00:00:${String(i * 2).padStart(2, '0')}.000 --> 00:00:${String(i * 2 + 2).padStart(2, '0')}.000\nLegenda linha ${i + 1}\n\n`
  fs.writeFileSync(path.join(FIX, 'multi', 'subs_por.vtt'), vtt)
  fs.writeFileSync(path.join(FIX, 'multi', 'subs_por.m3u8'), '#EXTM3U\n#EXT-X-TARGETDURATION:20\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:20,\nsubs_por.vtt\n#EXT-X-ENDLIST\n')
  fs.writeFileSync(path.join(FIX, 'multi', 'master.m3u8'), [
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",LANGUAGE="por",NAME="Português",DEFAULT=YES,AUTOSELECT=YES,URI="audio_por.m3u8"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",LANGUAGE="eng",NAME="English",DEFAULT=NO,AUTOSELECT=YES,URI="audio_eng.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="por",NAME="Português",DEFAULT=NO,AUTOSELECT=YES,URI="subs_por.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=320x180,CODECS="avc1.64000d,mp4a.40.2",AUDIO="aud",SUBTITLES="subs"',
    'video.m3u8',
    '',
  ].join('\n'))
  fs.writeFileSync(marker, '')
}
ensureFixtures()

const liveSegments = fs.readFileSync(path.join(FIX, 'live', 'index.m3u8'), 'utf8')
  .split('\n').filter((l) => l.endsWith('.ts'))

// --- Catalog ---
const img = (label, hue) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="hsl(${hue},60%,35%)"/><text x="100" y="150" font-size="22" fill="white" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`)}`

const liveCategories = [
  { category_id: '1', category_name: 'Notícias' },
  { category_id: '2', category_name: 'Esportes' },
  { category_id: '9', category_name: 'XXX Adultos' },
]
const liveStreams = [
  { stream_id: 101, name: 'Canal Notícias 24h', category_id: '1', tv_archive: 1, tv_archive_duration: 3 },
  { stream_id: 102, name: 'Canal Economia', category_id: '1', tv_archive: 0, tv_archive_duration: 0 },
  { stream_id: 103, name: 'Canal Clima', category_id: '1', tv_archive: 0, tv_archive_duration: 0 },
  { stream_id: 201, name: 'Esporte Total', category_id: '2', tv_archive: 1, tv_archive_duration: 7 },
  { stream_id: 202, name: 'Futebol HD', category_id: '2', tv_archive: 0, tv_archive_duration: 0 },
  { stream_id: 901, name: 'Canal Adulto', category_id: '9', tv_archive: 0, tv_archive_duration: 0 },
].map((s, i) => ({ ...s, stream_icon: img(s.name.split(' ')[1] || 'TV', i * 50), epg_channel_id: `ch${s.stream_id}` }))

const vodCategories = [
  { category_id: '10', category_name: 'Ação' },
  { category_id: '11', category_name: 'Comédia' },
  { category_id: '19', category_name: 'Adultos +18' },
]
const movies = [
  { stream_id: 1, name: 'Filme Explosivo', category_id: '10', rating: '8.1', added: '1700000300', year: '2023', genre: 'Ação' },
  { stream_id: 2, name: 'Corrida Final', category_id: '10', rating: '6.4', added: '1700000100', year: '2019', genre: 'Ação, Aventura' },
  { stream_id: 3, name: 'Multi Áudio Teste', category_id: '10', rating: '7.0', added: '1700000200', year: '2021', genre: 'Ação', ext: 'm3u8' },
  { stream_id: 4, name: 'Risada Garantida', category_id: '11', rating: '5.2', added: '1700000400', year: '2024', genre: 'Comédia' },
  { stream_id: 5, name: 'Amor e Confusão', category_id: '11', rating: '9.0', added: '1700000050', year: '2015', genre: 'Comédia, Romance' },
  { stream_id: 9, name: 'Filme Adulto', category_id: '19', rating: '0', added: '1700000000', year: '2020', genre: 'Adulto' },
].map((m, i) => ({ ...m, stream_icon: img(m.name.split(' ')[0], 200 + i * 30), container_extension: m.ext || 'mp4' }))

const seriesCategories = [{ category_id: '20', category_name: 'Drama' }]
const series = [
  { series_id: 50, name: 'Série Dramática', category_id: '20', rating: '8.7', genre: 'Drama', releaseDate: '2022-03-01', plot: 'Uma série de teste.' },
  { series_id: 51, name: 'Outra Série', category_id: '20', rating: '6.0', genre: 'Drama', releaseDate: '2018-01-01', plot: 'Mais uma.' },
].map((s, i) => ({ ...s, cover: img(s.name.split(' ')[0], 120 + i * 40), backdrop_path: [], cast: 'Fulano, Beltrano', director: 'Diretor X' }))

function episodesFor(seriesId) {
  const out = {}
  for (const season of [1, 2]) {
    out[season] = [1, 2, 3].map((n) => ({
      id: String(seriesId * 100 + season * 10 + n),
      episode_num: n,
      title: `T${season}E${n} - Episódio ${n}`,
      container_extension: 'mp4',
      info: { plot: `Plot ${season}x${n}`, duration: '00:00:20' },
    }))
  }
  return out
}

// --- EPG: 30-minute programs around "now" ---
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
function pad(n) {
  return String(n).padStart(2, '0')
}
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}
function programs(streamId, fromMs, count) {
  const slot = 30 * 60 * 1000
  const start0 = Math.floor(fromMs / slot) * slot
  const now = Date.now()
  const channel = liveStreams.find((s) => s.stream_id === streamId)
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(start0 + i * slot)
    const end = new Date(start0 + (i + 1) * slot)
    return {
      id: `${streamId}-${start.getTime()}`,
      epg_id: `ch${streamId}`,
      title: b64(`Programa ${start.getHours()}h${pad(start.getMinutes())} (${streamId})`),
      description: b64(`Descrição do programa às ${pad(start.getHours())}:${pad(start.getMinutes())}.`),
      start: fmt(start),
      end: fmt(end),
      start_timestamp: String(Math.floor(start.getTime() / 1000)),
      stop_timestamp: String(Math.floor(end.getTime() / 1000)),
      now_playing: start.getTime() <= now && now < end.getTime() ? 1 : 0,
      has_archive: channel?.tv_archive && end.getTime() < now ? 1 : 0,
    }
  })
}

// --- Server ---
const app = express()
export const requests = []
app.use((req, _res, next) => {
  requests.push(req.url)
  next()
})

app.get('/player_api.php', (req, res) => {
  const { username, password, action } = req.query
  if (username !== USER || password !== PASS) return res.json({ user_info: { auth: 0 } })
  const q = req.query
  const byCat = (list) => (q.category_id ? list.filter((x) => x.category_id === q.category_id) : list)
  switch (action) {
    case undefined:
      return res.json({
        user_info: {
          username: USER, password: PASS, auth: 1, status: 'Active',
          exp_date: String(Math.floor(Date.now() / 1000) + 30 * 86400), is_trial: '0',
          active_cons: '0', max_connections: '2', created_at: '1690000000',
          allowed_output_formats: ['m3u8', 'ts'],
        },
        server_info: { url: 'localhost', port: String(PORT), server_protocol: 'http', server_name: 'Mock Panel', timezone: 'America/Sao_Paulo' },
      })
    case 'get_live_categories': return res.json(liveCategories)
    case 'get_vod_categories': return res.json(vodCategories)
    case 'get_series_categories': return res.json(seriesCategories)
    case 'get_live_streams': return res.json(byCat(liveStreams))
    case 'get_vod_streams': return res.json(byCat(movies))
    case 'get_series': return res.json(byCat(series))
    case 'get_vod_info': {
      const m = movies.find((x) => x.stream_id === Number(q.vod_id))
      if (!m) return res.json({ info: [], movie_data: {} })
      return res.json({
        info: { name: m.name, plot: `Sinopse de ${m.name}.`, cast: 'Ator A, Atriz B', director: 'Diretora C', genre: m.genre,
          releasedate: `${m.year}-05-01`, duration: '00:00:20', rating: m.rating, movie_image: m.stream_icon, backdrop_path: [] },
        movie_data: { stream_id: m.stream_id, category_id: m.category_id, container_extension: m.container_extension },
      })
    }
    case 'get_series_info': {
      const s = series.find((x) => x.series_id === Number(q.series_id))
      if (!s) return res.json({ info: {}, episodes: {} })
      return res.json({
        info: { ...s, release_date: s.releaseDate },
        seasons: [1, 2].map((n) => ({ season_number: n, name: `Temporada ${n}`, overview: null, cover: null })),
        episodes: episodesFor(s.series_id),
      })
    }
    case 'get_short_epg': {
      const id = Number(q.stream_id)
      return res.json({ epg_listings: programs(id, Date.now(), Number(q.limit || 4)) })
    }
    case 'get_simple_data_table': {
      const id = Number(q.stream_id)
      // Whole "day": from 6h ago to 18h ahead, like real panels (past included).
      return res.json({ epg_listings: programs(id, Date.now() - 6 * 3600_000, 48) })
    }
    default:
      return res.json([])
  }
})

function checkCreds(req, res) {
  if (req.params.u !== USER || req.params.p !== PASS) {
    res.status(401).send('bad creds')
    return false
  }
  return true
}

// Live: a sliding 5-segment window that loops the 10 fixture segments forever.
app.get('/live/:u/:p/:file', (req, res) => {
  if (!checkCreds(req, res)) return
  const seq = Math.floor(Date.now() / 2000)
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:2', `#EXT-X-MEDIA-SEQUENCE:${seq}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${Math.floor(seq / liveSegments.length)}`]
  for (let k = 0; k < 5; k++) {
    const n = seq + k
    if (k > 0 && n % liveSegments.length === 0) lines.push('#EXT-X-DISCONTINUITY')
    lines.push('#EXTINF:2.0,', `/fixtures/live/${liveSegments[n % liveSegments.length]}`)
  }
  res.type('application/vnd.apple.mpegurl').send(lines.join('\n') + '\n')
})

// Catch-up / timeshift: plays the fixture as finite VOD HLS.
app.get('/timeshift/:u/:p/:duration/:start/:file', (req, res) => {
  if (!checkCreds(req, res)) return
  res.type('application/vnd.apple.mpegurl').send(
    fs.readFileSync(path.join(FIX, 'live', 'index.m3u8'), 'utf8').replace(/^(seg\d+\.ts)$/gm, '/fixtures/live/$1'),
  )
})

app.get(['/movie/:u/:p/:file', '/series/:u/:p/:file'], (req, res) => {
  if (!checkCreds(req, res)) return
  if (req.params.file.endsWith('.m3u8')) return res.redirect(302, '/fixtures/multi/master.m3u8')
  res.sendFile(path.join(FIX, 'video.mp4'))
})

app.use('/fixtures', express.static(FIX))

app.listen(PORT, () => console.log(`mock xtream on http://localhost:${PORT} (user ${USER} / ${PASS})`))
