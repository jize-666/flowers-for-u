from flask import Blueprint, current_app, make_response, redirect, render_template, request, url_for

opening = Blueprint('flowers_opening', __name__, template_folder='templates')


@opening.get('/opening')
@opening.get('/opening/')
def show_opening():
    response = make_response(render_template('opening.html'))
    response.headers['Cache-Control'] = 'no-cache'
    return response


@opening.before_app_request
def opening_before_garden():
    if (current_app.config.get('FLOWERS_OPENING_AT_ROOT', True)
            and request.method in ('GET', 'HEAD')
            and request.path == '/'
            and request.args.get('garden') != '1'):
        return redirect(url_for('flowers_opening.show_opening'))
    return None


def install_opening(app):
    if 'flowers_opening' in app.blueprints:
        return
    app.config.setdefault('FLOWERS_OPENING_AT_ROOT', True)
    app.register_blueprint(opening)
