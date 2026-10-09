// TV (Fire TV/Android TV, Samsung Tizen, LG webOS...): sem download — na TV so se assiste (decisao do
// Christian, 08/10). Pelo user agent, que as TVs anunciam.
export const isTv = /\bAFT|Android TV|GoogleTV|SMART-TV|SmartTV|Tizen|Web0S|webOS|BRAVIA|AppleTV/i.test(navigator.userAgent)
