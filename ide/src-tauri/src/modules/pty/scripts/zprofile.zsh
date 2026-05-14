# atlas-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _atlas_user_zdotdir="${ATLAS_USER_ZDOTDIR:-$HOME}"
  [ -f "$_atlas_user_zdotdir/.zprofile" ] && source "$_atlas_user_zdotdir/.zprofile"
  unset _atlas_user_zdotdir
}
:
