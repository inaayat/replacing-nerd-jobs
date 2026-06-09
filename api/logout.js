export default function handler(request, response) {
  response.setHeader(
    'Set-Cookie',
    '__auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  );
  response.redirect(302, '/');
}
