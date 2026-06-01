# sentor-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _sentor_user_zdotdir="${SENTOR_USER_ZDOTDIR:-$HOME}"
  [ -f "$_sentor_user_zdotdir/.zprofile" ] && source "$_sentor_user_zdotdir/.zprofile"
  unset _sentor_user_zdotdir
}
:
