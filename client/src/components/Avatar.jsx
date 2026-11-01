export default function Avatar({ user, size = 32 }) {
  const initials = (user?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (user?.avatarUrl)
    return <img className="avatar" style={style} src={user.avatarUrl} alt={user.name} title={user.name} />;
  return (
    <span className="avatar avatar-initials" style={style} title={user?.name}>
      {initials}
    </span>
  );
}
