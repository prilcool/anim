// colors
var gray = "#cccccc";
var grid = "#eeeeee";
var grid_guide = "#dddddd";
var graph_guide = "#aaaaaa";
var dark = "#000000";
var light = "#ffffff";

var colors = ["#000000", "#E74C3C", "#2980B9", "#FFA400"];

var font_small = "16px Courier";
var font_menu = "20px Courier";
var font_anim = "26px Menlo";

// scatter
var point_size = 6;

var c;
var ctx;

var animator;
var objs = [];
var frames;
var menu;
var cam;
var num_frames = 3;
var frame = 1; // current frame
var next_frame;
var playing;
var rendering = false;
var presenting = false;
var debug = false;

var t_ease = 0;
var t_steps = 60;

var grid_size = 30;
var mouse_time = 0;
var mouse_duration = 40;

var tool = "select";
var selecting = false;
var new_line;

var mouse_down = false;
var ctrl = false;
var meta = false;
var mouse = {x: 0, y: 0};
var mouse_last = {x: 0, y: 0};
var mouse_start = {x: 0, y: 0};
var mouse_grid = {x: 0, y: 0};
var mouse_last_grid = {x: 0, y: 0};
var mouse_graph = {x: 0, y: 0};

var brackets = {"(": 1, "[": 1, ")": -1, "]": -1};

var t = 0; // time for parser

var pi2 = 2 * Math.PI;

// fn drawing
let char_size = grid_size/2;
let char_pad = grid_size/4;

var parser = math.parser();
parser.set('frame', frame);

// custom functions!
function sig(x) {
    return 1/(1+math.exp(-x));
}

function sigp(x) {
    return math.exp(-x)/math.pow(1+math.exp(-x), 2);
}

// http://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve
// Maxwell Collard
function randn_bm() {
    var u = 1 - Math.random(); // Subtraction to flip [0, 1) to (0, 1].
    var v = 1 - Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}

// cache
var grid_cache = {};

math.import({
    randn: function() { // no args: random normal, 1 arg shape: dims of matrix to return
        let N = arguments.length;
        if (N == 1) {
            let shape = arguments[0];
            let m = math.zeros(shape);
            m = m.map(function (value, index, matrix) {
                return randn_bm();
            });

            return m;
        }
        return randn_bm();
    },
    block: function() { // exectutes string a for a in actions
        let N = arguments.length;
        for (var i = 0; i < N; i++) {
            let expr = arguments[i];
            if (typeof expr == "string") {
                parser.eval(expr);
            } else {
                expr();
            }
        }
    },
    rotation: function(rx, ry, rz) { // creates a 3x3 rotation matrix
        return math.matrix(rotation_matrix(rx, ry, rz));
    },
    grid: function(rangex, rangey) { // returns matrix x*y by 2
        let m = [];
        xd = rangex._data;
        yd = rangey._data;
        for (let i = 0; i < xd.length; i ++) {
            for (let j = 0; j < yd.length; j ++) {
                m.push([xd[i], yd[j]]);
            }
        }

        return math.matrix(m);
    },
    rotate: function(rx, ry, rz) { // rotates the camera
        let rxyz = [rx, ry, rz];
        if (!isNaN(math.sum(rxyz))) {
            cam.properties[frame].rxyz = rxyz;
        } else {
            cam.properties[frame].rxyz = [0, 0, 0];
        }
    },
    T: function(m) { // transpose m
        return math.transpose(m);
    },
    scatter: function(points, point_size, color_fn) { // points [[x1, y1, z1], ...], psize, color([x,y,z])=[r,g,b] 0 <= r <= 1
        let size = points.size();
        let n = size[0];
        let points_d = points._data;

        let psize = 4;
        if (arguments.length >= 2) {
            psize = arguments[1];
        }
        let psize_half = psize/2;

        let cam_data = cam.graph_to_screen_mat(points);
        
        ctx.save();
        if (arguments.length == 3) {
            // gradation

            var indices = new Array(n);
            for (var i = 0; i < n; ++i) indices[i] = i;

            indices.sort(function(a, b) {
                a = cam_data[a][2];
                b = cam_data[b][2];
                return a < b ? 1 : (a > b ? -1 : 1);
            });
            
            for (let j = 0; j < n; j++) {
                let i = indices[j];

                let p = points_d[i];

                // constrain
                let col = color_fn(p)._data;
                col = [constrain(col[0]), constrain(col[1]), constrain(col[2])];
                ctx.fillStyle = rgbToHex(math.multiply(col, 255));
                ctx.fillRect(cam_data[i][0]-psize_half, cam_data[i][1]-psize_half, psize, psize);
            }
        } else {
            for (let i = 0; i < n; i++) {
                ctx.fillRect(cam_data[i][0]-psize_half, cam_data[i][1]-psize_half, psize, psize);
            }
        }
        ctx.restore();
    },
    graph: function(fn) { // graphs y=f(x) from -10 to 10
        let y = 0;
        let p; let gp;
        let N = 100;
        let points = math.zeros([101, 3]);

        let i = 0;
        for (let x = -10; x < 10; x += .2) {
            y = fn(x);
            y = Math.max(Math.min(y, 1000), -1000);

            points[i][0] = x;
            points[i][1] = y;

            i ++;
        }

        points = cam.graph_to_screen_mat(math.matrix(points));

        ctx.beginPath();
        for (let i = 0; i < N; i++) {
            p = points[i];
            if (i == 0) {
                ctx.moveTo(p[0], p[1]);
            } else {
                ctx.lineTo(p[0], p[1]);
            }
        }
        ctx.stroke();

        gp = {x: mouse_graph.x, y: fn(mouse_graph.x)};
        if (ctrl && mouse_graph.x > -10 && mouse_graph.x < 10 && distance(mouse_graph, gp) < .2) {
            p = cam.graph_to_screen(gp.x, gp.y, 0);
            ctx.fillText('('+pretty_round(gp.x)+', '+pretty_round(gp.y)+')', p[0], p[1] - grid_size);
            ctx.beginPath();
            ctx.arc(p[0], p[1], point_size, 0, pi2);
            ctx.fill();
        }
    },
    lines: function(points) { // draws line from point to point [[x1,y1,z1], ...]
        let N = points.size()[0];
        points = cam.graph_to_screen_mat(points);

        ctx.beginPath();
        let p;
        for (let i = 0; i < N; i ++) {
            p = points[i];
            if (i == 0) {
                ctx.moveTo(p[0], p[1]);
            } else {
                ctx.lineTo(p[0], p[1]);
            }
        }

        ctx.stroke();
    },
    if: function(string_x, string_a, string_b) { // if x == true then eval string_a else eval string_b
        if (parser.eval(string_x)) {
            return parser.eval(string_a);
        } else {
            return parser.eval(string_b);
        }
    },
    list: function(fn, array) { // [fn(v) for v in array]
        let m = [];
        let N = array.size()[0];
        let d = array._data;

        for (let i = 0; i < N; i++) {
            let v = fn(d[i]);
            if (v._data) {
                m.push(v._data);
            } else {
                m.push(v);
            }
        }

        return math.matrix(m);
    },
    view: function(x, p) { // matrix, position: [x, y, z]

        let t = [];
        if (x._data) {
            x = x.map(function (value, index, matrix) {
                return pretty_round(value);
            });

            let d = x._data;
            if (x._size.length == 1) {
                t = [d.join(' ')];
            } else {
                for (let r = 0; r < d.length; r++) {
                    t.push(d[r].join(' '));
                }
            }
        }

        if (p) {
            p = p._data;
        } else {
            p = [0, 0];
        }
        
        p = cam.graph_to_screen(p[0], p[1], 0);
        for (let i = 0; i < t.length; i++) {
            ctx.textAlign = 'left';
            ctx.fillText(t[i], p[0], p[1] + grid_size * i);
        }
    },
    labels: function(labels, points) { // render labels ["l1", ...] at [[x1, y1, z1], ...]
        points = cam.graph_to_screen_mat(points);
        let N = labels.size()[0];
        let p;
        ctx.save();
        ctx.textAlign = 'center';
        for (let i = 0; i < N; i++) {
            p = points[i];
            ctx.fillText(labels._data[i], p[0], p[1]);
        }
        ctx.restore();
    },
    sig: function(x) { // sigmoid(x)
        if (x._data) {
            var b = x.map(function (value, index, matrix) {
                return sig(value);
            });
            return b;
        }

        return sig(x);
    },
    sigp: function(x) { // sigmoid_prime(x)
        if (x._data) {
            var b = x.map(function (value, index, matrix) {
                return sigp(value);
            });
            return b;
        }

        return sigp(x);
    },
});

// undo
var states = [];

function rgb1ToHex(a) {
    let c = [Math.round(a[0]*255), 
            Math.round(a[1]*255),
            Math.round(a[2]*255)];
    return rgbToHex(c);
}

window.requestAnimFrame = function() {
    return (
        window.requestAnimationFrame       || 
        window.webkitRequestAnimationFrame || 
        window.mozRequestAnimationFrame    || 
        window.oRequestAnimationFrame      || 
        window.msRequestAnimationFrame     || 
        function(/* function */ callback){
            window.setTimeout(callback, 1000 / 60);
        }
    );
}();

// http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

function Animator(fps, canvas, frames, callback) {
    this.fps = fps;
    this.canvas = canvas;
    this.frames = frames;
    this.callback = callback;

    if (this.frames > 0) {
        // Create a capturer that exports a WebM video
        this.capturer = new CCapture( { format: 'png', framerate: this.fps } );
        this.capturer.start();
    }

    this.animate = function () {
        if (this.frames > 0) {
            this.frames -= 1;
            requestAnimationFrame(this.animate);
        } else {
            if (this.capturer) {
                this.capturer.stop();
                this.capturer.save();
                this.capturer = null;
            }

            setTimeout(function() {
                requestAnimationFrame(this.animate);
            }, 1000/this.fps);
        }

        this.callback();
        this.capturer.capture(this.canvas);
    }

    this.animate();
}

function pretty_round(num) {
    return (Math.round(num*100)/100).toFixed(2);
}

function draw_r(o, p, d) {
    // o tree object
    // p position
    // d should draw, false to just get the size

    let text = '';
    let argc = 0;
    let args;

    if (o && o.args) {
        args = o.args;
        argc = args.length;
    }

    let size = {w: 0, h: 0};

    if (args) {
        
        if (o.name && o.name.length) {
            text = o.name;
        } else if (o.op && o.op.length) {
            text = o.op;
        }
        
        if (text == "+" || text == "-" || text == "*") {
            if (argc == 1) {
                if (d) ctx.fillText(text, p.x, p.y);
                let s1 = draw_r(args[0], {x: p.x + char_size, y: p.y}, d);

                size.w = s1.w + char_size;
                size.h = s1.h;
            } else if (argc == 2) {
                // draw on the left and the right

                let center = true; // false -> bottom align

                let s1 = draw_r(args[0], {x: 0, y: 0}, false);
                let s2 = draw_r(args[1], {x: 0, y: 0}, false);

                size.w = s1.w + text.length * char_size + char_pad + s2.w + char_pad;
                size.h = Math.max(s1.h, s2.h);

                let opp = {x: 0, y: 0};
                if (center) {
                    s1 = draw_r(args[0], {x: p.x, y: p.y + size.h/2 - s1.h/2}, d);
                    opp = {x: p.x + s1.w + char_pad, y: p.y + size.h/2 - char_size};
                    s2 = draw_r(args[1], {x: p.x + s1.w + char_pad + text.length*char_size + char_pad, y: p.y + size.h/2 - s2.h/2}, d);
                } else {
                    // bottom align
                    s1 = draw_r(args[0], {x: p.x, y: p.y + size.h - s1.h}, d);
                    opp = {x: p.x + s1.w + char_pad, y: p.y + size.h - char_size*2};
                    s2 = draw_r(args[1], {x: p.x + s1.w + char_pad + text.length*char_size + char_pad, y: p.y + size.h - s2.h}, d);
                }

                if (d) {
                    if (text == "*") {
                        ctx.beginPath();
                        ctx.arc(opp.x + char_size/2, opp.y+char_size, 3, 0, pi2);
                        ctx.fill();
                    } else {
                        ctx.fillText(text, opp.x, opp.y);
                    }
                }
            }
        } else if (text == "^") {
            if (argc == 2) {
                // draw on the left and the right, shifted up!
                let a = args[0];
                let b = args[1];

                if (b.content) {
                    b = b.content;
                }

                let s1 = draw_r(a, {x: 0, y: 0}, false);
                let s2 = draw_r(b, {x: 0, y: 0}, false);

                size.w = s1.w + s2.w;
                size.h = s1.h + s2.h - char_size;

                draw_r(a, {x: p.x, y: p.y + size.h - s1.h}, d);
                draw_r(b, {x: p.x + s1.w, y: p.y}, d);
            }
        } else if (text == "/") {
            if (argc == 2) {
                // draw on top and bottom
                let a = args[0]; let b = args[1];

                // remove unnecessary parens
                if (a.content) {
                    a = a.content;
                }

                if (b.content) {
                    b = b.content;
                }

                let s1 = draw_r(a, {x: 0, y: 0}, false);
                let s2 = draw_r(b, {x: 0, y: 0}, false);

                size.w = Math.max(s1.w, s2.w) + char_pad*2;
                size.h = Math.max(s1.h, s2.h)*2 + char_pad*4;

                if (d) {

                    draw_r(a, {x: p.x + size.w/2 - s1.w/2, y: p.y + size.h/2 - s1.h - char_pad*2}, d);
                    draw_r(b, {x: p.x + size.w/2 - s2.w/2, y: p.y + size.h/2 + char_pad*2}, d);

                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y + size.h/2);
                    ctx.lineTo(p.x + size.w, p.y + size.h/2);
                    ctx.stroke();
                }
            }
        } else if (text == "!") {
            let s1 = draw_r(args[0], {x: p.x, y: p.y}, d);
            if (d) ctx.fillText(text, p.x + s1.w, p.y);

            size.w = s1.w + char_size;
            size.h = s1.h;
        } else if (o.fn) {
            // function call
            let h = 0;

            // get height of all args
            let N = args.length;
            let hs = [];
            for (let i = 0; i < N; i ++) {
                let s1 = draw_r(args[i], {x: 0, y: 0}, false);
                hs.push(s1);

                h = Math.max(h, s1.h);
            }

            size.h = h;

            // draw it
            text = o.name + "(";
            let cally = p.y + size.h/2 - char_size;

            if (d) {
                for (let i = 0; i < text.length; i ++) {
                    ctx.fillText(text[i], p.x+i*char_size, cally);
                }
            }

            let xo = text.length * char_size;

            for (let i = 0; i < N; i ++) {
                let s1 = draw_r(args[i], {x: p.x + xo, y: p.y + size.h/2 - hs[i].h/2}, d);
                xo += s1.w;

                if (i == N-1) {
                    if (d) ctx.fillText(")", p.x + xo, cally);
                } else {
                    if (d) ctx.fillText(",", p.x + xo, cally);
                }
                
                xo += char_size;
            }

            size.w = xo;
        }

    } else {
        // no args

        if (o.name && o.name.length) {
            text = o.name;
        } else if (o.value) {
            text = o.value;
        } else {
            text = '?';
        }
        
        if (o.content) {
            // parens
            let s1 = draw_r(o.content, {x: 0, y: 0}, false);
            //ctx.save();
            //ctx.scale(1, s1.h/(char_size*2));
            if (d) ctx.fillText("(", p.x, p.y + s1.h/2-char_size);
            if (d) ctx.fillText(")", p.x + s1.w + char_size, p.y + s1.h/2-char_size);
            //ctx.restore();

            s1 = draw_r(o.content, {x: p.x + char_size, y: p.y}, d);

            size.w = s1.w + char_size*2;
            size.h = s1.h;
        } else if (o.node) {
            size = draw_r(o.node, {x: p.x, y: p.y}, d);
        } else if (o.object && o.value) {
            // assignment
            
            let s1 = draw_r(o.value, {x: 0, y: 0}, false);
            let text = o.object.name + " = ";

            if (d) {
                ctx.save();
                ctx.translate(p.x, p.y + s1.h/2-char_size);
                draw_simple(text);
                ctx.restore();
                
                draw_r(o.value, {x: p.x + text.length*char_size, y: p.y}, d);
            }

            size.w = s1.w + text.length * char_size;
            size.h = s1.h;
        } else if (o.blocks) {
            // block

            let items = o.blocks;
            let h = 0;

            // get height of all args
            let N = items.length;
            let hs = [];
            for (let i = 0; i < N; i ++) {
                let s1 = draw_r(items[i], {x: 0, y: 0}, false);
                hs.push(s1);

                h = Math.max(h, s1.h);
            }

            size.h = h;

            // draw it
            let cally = p.y + size.h/2 - char_size;
            let xo = 0;

            for (let i = 0; i < N; i ++) {
                let s1 = draw_r(items[i], {x: p.x + xo, y: p.y + size.h/2 - hs[i].h/2}, d);
                xo += s1.w;

                if (i != N-1) {
                    if (d) ctx.fillText(";", p.x + xo, cally);
                }
                xo += char_size;
            }

            xo -= char_size;

            size.w = xo;

        } else if (o.items) {
            // array

            let items = o.items;
            let h = 0;

            // get height of all args
            let N = items.length;
            let hs = [];
            for (let i = 0; i < N; i ++) {
                let s1 = draw_r(items[i], {x: 0, y: 0}, false);
                hs.push(s1);

                h = Math.max(h, s1.h);
            }

            size.h = h;

            // draw it
            let cally = p.y + size.h/2 - char_size;
            let xo = char_size; // first open bracket

            for (let i = 0; i < N; i ++) {
                let s1 = draw_r(items[i], {x: p.x + xo, y: p.y + size.h/2 - hs[i].h/2}, d);
                xo += s1.w;

                if (i != N-1) {
                    if (d) ctx.fillText(",", p.x + xo, cally);
                }
                xo += char_size;
            }

            ctx.save();
            ctx.scale(1, size.h/(char_size*2));
            if (d) ctx.fillText("[", p.x, cally);
            if (d) ctx.fillText("]", p.x + xo - char_size, cally);
            ctx.restore();

            size.w = xo;

        } else if (o.expr) {
            // function definition
            let s1 = draw_r(o.expr, {x: 0, y: 0}, false);

            text = o.name;
            text += "(" + o.params.join(",") + ") = ";

            if (d) {
                ctx.save();
                ctx.translate(p.x, p.y + s1.h/2 - char_size);
                draw_simple(text);
                ctx.restore();
            }

            let xo = text.length*char_size;

            draw_r(o.expr, {x: p.x + xo, y: p.y}, d);

            size.w = xo + s1.w;
            size.h = s1.h;

        } else {
            if (d) {
                let N = text.length;
                for (let i = 0; i < N; i ++) {
                    ctx.fillText(text[i], p.x + i*char_size, p.y);
                }
            }
            
            size.w = text.length * char_size;
            size.h = char_size * 2;
        }
    }

    if (debug && d) ctx.strokeRect(p.x, p.y, size.w, size.h);

    return size;
}

function draw_simple(text) {
    for (let i = 0; i < text.length; i++) {
        ctx.fillText(text[i], i * char_size, 0);
    }
    return text.length * char_size;
}

let cache = {};
function draw_fn(fn) {

    let tree;

    if (cache[fn]) {
        tree = cache[fn];
    } else {
        try {
            tree = math.parse(fn);
        } catch(e) {

        }

        if (tree) {
            cache[fn] = tree;
        }
    }

    if (!tree) {
        return {w: 0, h: 0};
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let size = draw_r(tree, {x: 0, y: 0}, false);
    draw_r(tree, {x: 0, y: -size.h/2}, true);
    ctx.restore();

    return size;
}

function function_before_i(text, c) {
    text = text.slice(0, c);
    let s = text.split(/[^A-Za-z]/);
    return s.pop();
}

function get_mouse_pos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}

function constrain_to_grid(p) {
    let gs = grid_size / 4;
    return {x: Math.floor((p.x + gs/2) / gs) * gs, y: Math.floor((p.y + gs/2) / gs) * gs};
}

function distance(a, b) {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function between(a, b) {
    return {x: (a.x + b.x)/2, y: (a.y + b.y)/2};
}

function grad_2(c, x, y) {
    // c is compiled obj
    // depends on x and y
    let h = 0.0001;

    parser.set('x', x+h);
    let fxh = c.eval(parser.scope);
    parser.set('x', x);
    let fx = c.eval(parser.scope);

    parser.set('y', y+h);
    let fyh = c.eval(parser.scope);
    parser.set('y', y);
    let fy = c.eval(parser.scope);

    return [(fxh-fx)/h, (fyh-fy)/h];
}

function rotation_matrix(rx, ry, rz) {
    let Rx = [[1,        0,        0],
                  [0, Math.cos(rx), -Math.sin(rx)],
                  [0, Math.sin(rx), Math.cos(rx)]];

    let Ry = [[Math.cos(ry),   0, Math.sin(ry)],
            [0, 1, 0],
            [-Math.sin(ry), 0, Math.cos(ry)]];

    let Rz = [[Math.cos(rz), -Math.sin(rz), 0],
            [Math.sin(rz), Math.cos(rz), 0],
            [0, 0, 1]];

    return math.multiply(math.multiply(Rx, Ry), Rz);
}

function sigmoid(x, num, offset, width) {
    return num / (1.0 + Math.exp(-(x+offset)*width));
}

function ease_in_out(x) {
    return 1.0 / (1.0 + Math.exp(-(x-.5)*10));
}

function copy(d) {
    return JSON.parse(JSON.stringify(d));
}

function change_frames() {
    for (let i = 0; i < objs.length; i++) {
        obj = objs[i];
        if (obj.properties[frame] && obj.properties[next_frame] == null) {
            obj.properties[next_frame] = copy(obj.properties[frame]);
            if (next_frame < frame) {
                // make that shit transparent?
                obj.properties[next_frame].c[3] = 0.0;
            }
        }
    }
}

function rgbToHex(c) {
    return "#" + ((1 << 24) + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2])).toString(16).slice(1);
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
     ] : null;
}

function transform_props(key, props) {
    let step = .2;

    if (key == "l") {
        props.w += step;
    } else if (key == "j") {
        props.w -= step;
    } else if (key == "i") {
        props.h += step;
    } else if (key == "k") {
        props.h -= step;
    } else if (key == "u") {
        props.r -= Math.PI/12;
    } else if (key == "o") {
        props.r += Math.PI/12;
    }

    return props;
}

function interpolate(a, b) {
    if (!b) {
        return a;
    }

    let interp = {};
    for (key in a) {
        if (key == "p") {
            // interpolate position
            let ap = a[key];
            let bp = b[key];

            interp[key] = {x: (1-t_ease) * ap.x + t_ease * bp.x,
                           y: (1-t_ease) * ap.y + t_ease * bp.y};
        } else if (key == "w" || key == "h" || key == "r" || key == "a_s" || key == "a_e") {
            // interpolate width, height, or rotation
            let aw = a[key];
            let bw = b[key];
            interp[key] = (1-t_ease) * aw + t_ease * bw;
        } else if (key == "rxyz") {
            let ar = a[key];
            let br = b[key];
            interp[key] = [0, 0, 0];
            for (let i = 0; i < 3; i ++) {
                interp[key][i] = (1-t_ease) * ar[i] + t_ease * br[i];
            }
        } else if (key == "c") {
            // interpolate colors
            let ac = a[key];
            let bc = b[key];
            interp[key] = interpolate_colors_rgb(ac, bc, constrain(t_ease));
        } else if (key == "path") {
            // interpolate paths
            let ap = a[key];
            let bp = b[key];
            
            ip = [];
            for (let i = 0; i < ap.length; i ++) {
                let newp = {x: (1-t_ease) * ap[i].x + t_ease * bp[i].x,
                            y: (1-t_ease) * ap[i].y + t_ease * bp[i].y};
                ip.push(newp);
            }

            interp[key] = ip;
        } else if (key == "t") {
            if (t_ease < .5) {
                interp[key] = a[key];
            } else {
                interp[key] = b[key];
            }
        } else {
            interp[key] = a[key];
        }
    }

    return interp;
}

function interpolate_colors_rgb(ac, bc, interp) {
    let ic = [];
    for (let i = 0; i < ac.length; i++) {
        ic.push((1-interp) * ac[i] + interp * bc[i]);
    }

    return ic;
}

function Button(text, pos, callback) {
    this.text = text;
    this.pos = pos;
    this.callback = callback;
    this.color = "";
    this.align = 'left';
    this.selected = false;

    this.width = text.length * grid_size/4;
    this.height = grid_size/4;

    if (this.width == 0) {
        this.width = grid_size;
    }
    
    this.hovering = function() {
        return (mouse.x > this.pos.x && mouse.x < this.pos.x + this.width && Math.abs(mouse.y - this.pos.y) < this.height);
    }

    this.mouse_up = function(evt) {
        if (this.hovering()) {
            // clicked
            if (this.callback) {
                this.callback(this);
            }
            return true;
        }

        return false;
    }

    this.render = function(ctx) {
        ctx.save();

        ctx.translate(this.pos.x, this.pos.y);

        if (this.hovering() || this.selected) {
            ctx.scale(1.5, 1.5);
        }

        if (this.color.length) {
            ctx.fillStyle = this.color;
            ctx.fillRect(0, -grid_size/8, grid_size, grid_size/4);
        }

        ctx.textAlign = this.align;
        ctx.font = font_small;
        ctx.fillText(this.text, 0, 0);

        ctx.restore();
    }
}

function Shape(color, path) {
    this.type = "Shape";
    this.guid = guid();
    this.properties = {};
    this.properties[frame] = {c: color, path: path, v: false, w: 1, h: 1, r: 0};

    this.selected_indices = [];

    this.duplicate = function() {
        if (this.selected_indices.length == 0) {
            return;
        }

        let newc = new Shape(null, null);
        newc.properties[frame] = copy(this.properties[frame]);
        // select all indices for next one
        for (let i = 0; i < newc.properties[frame].path.length; i++) {
            newc.selected_indices.push(i);
        }

        this.selected_indices = [];
        objs.push(newc);
    }

    this.hidden = function() {
        if (!this.properties[frame]) {
            return true;
        }

        return this.properties[frame].c[3] == 0;
    }

    this.copy_properties = function(f, n) {
        this.properties[n] = copy(this.properties[f]);
    }

    this.hide = function() {
        if (this.selected_indices.length != 0) {
            if (this.properties[frame].c[3] == 1) {
                this.properties[frame].c[3] = 0;
            } else {
                this.properties[frame].c[3] = 1;
            }
            this.selected_indices = [];
        }
    }

    this.select = function() {
        this.selected_indices = [];
        for (let i = 0; i < this.properties[frame].path.length; i++) {
            this.selected_indices.push(i);
        }
    }

    this.is_selected = function() {
        return this.selected_indices.length > 0;
    }

    this.set_color = function(rgba) {
        if (this.selected_indices.length != 0) {
            rgba[3] = this.properties[frame].c[3];
            this.properties[frame].c = rgba;
        }
    }

    this.clear_props = function(f) {
        delete this.properties[f];
    }

    this.clear_all_props = function() {
        if (this.selected_indices.length == 0) {
            return;
        }

        for (var key in this.properties) {
            if (key != frame) {
                delete this.properties[key];
            }
        }
    }

    this.add_point = function(p) {
        let props = this.properties[frame];
        let path = props.path;
        path.push(p);
    }

    this.closest_point_idx = function() {
        let props = this.properties[frame];
        let path = props.path;
        for (let i = 0; i < path.length; i++) {
            let p = path[i];

            if (distance(p, mouse) < grid_size/8) {
                return i;
            }
        }

        return -1;
    }

    this.in_rect = function(x, y, x2, y2) {
        // select individual points
        let props = this.properties[frame];

        if (this.hidden()) {
            return;
        }

        let path = props.path;
        this.selected_indices = [];
        let found = false;

        for (let i = 0; i < path.length; i++) {
            let p = path[i];

            if (p.x > x && p.x < x2 && p.y > y && p.y < y2) {
                this.selected_indices.push(i);
                found = true;
            }
        }

        return found;
    }

    this.onkeydown = function(evt) {
        let key = evt.key;

        if (this.selected_indices.length != 0) {
            this.properties[frame] = transform_props(key, this.properties[frame]);
        }

        return false;
    }

    this.mouse_down = function(evt) {
        if (this.hidden()) {
            return false;
        }

        // try to selected one
        let idx = this.closest_point_idx();
        if (idx != -1) {
            this.selected_indices = [idx];
            return true;
        }

        return false;
    }

    this.mouse_drag = function(evt) {
        if (this.selected_indices.length > 0) {
            let props = this.properties[frame];
            let path = props.path;

            if (tool == "select") {
                // move all
                let offset = {x: mouse_grid.x - mouse_grid_last.x,
                          y: mouse_grid.y - mouse_grid_last.y};
                for (let i = 0; i < this.selected_indices.length; i++) {
                    let idx = this.selected_indices[i];
                    let p = path[idx];
                    path[idx] = {x: p.x + offset.x, y: p.y + offset.y};
                }
            }
        }
    }

    this.mouse_up = function(evt) {
        if (meta) {
            return;
        }

        this.selected_indices = [];
    }

    this.bezier = function(points, off, t) {
        let x = points[0].x - off.x;
        let y = points[0].y - off.y;
        let c = 0;
        let N = points.length;
        for (let i = 0; i < N; i++) {
            c = math.factorial(N) / (math.factorial(N-i) * math.factorial(i));

            c *= math.pow(1-t, N-i) * math.pow(t, i);

            x += c * (points[i].x - off.x);
            y += c * (points[i].y - off.y);
        }

        return [x, y];
    }

    this.draw_path = function(props) {
        let path = props.path;
        let c = {x: 0, y: 0};

        
        for (let i = 0; i < path.length; i++) {
            c.x += path[i].x;
            c.y += path[i].y;
        }

        c.x /= path.length;
        c.y /= path.length;

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(props.r);
        ctx.scale(props.w, props.h);

        let idx = this.closest_point_idx();

        let hidden = this.hidden();

        for (let i = 0; i < path.length; i++) {
            let p = path[i];
            
            if (i == 0) {
                ctx.moveTo(p.x - c.x, p.y - c.y);
            } else {
                ctx.lineTo(p.x - c.x, p.y - c.y);
            }

            // show selected indices
            if (!presenting && !hidden && (this.selected_indices.indexOf(i) != -1 || i == idx)) {
                ctx.strokeStyle = dark;
                ctx.strokeRect(p.x- c.x -grid_size/2, p.y - c.y - grid_size/2, grid_size, grid_size);
            }
        }

        if (this.selected_indices.length > 0) {
            // render side lengths while dragging
            for (let i = 0; i < path.length - 1; i++) {
                let p1 = path[i];
                let p2 = path[i+1];
                let b = between(p1, p2);
                let d = distance(p1, p2) / grid_size;
                d = Math.round(d * 10) / 10;
                ctx.font = font_small;
                ctx.fillText(d, b.x - c.x, b.y - c.y);
            }
        }

        if (this.properties[frame].v && path.length >= 2) {
            // vector
            let b = path[path.length-2];
            let a = path[path.length-1];

            let theta = Math.atan2(a.y - b.y, a.x - b.x);
            ctx.moveTo(a.x - c.x, a.y - c.y);
            ctx.lineTo(a.x - c.x + Math.cos(theta - Math.PI*3/4) * grid_size/2, a.y - c.y + Math.sin(theta - Math.PI*3/4) * grid_size/2);
            ctx.moveTo(a.x - c.x, a.y - c.y);
            ctx.lineTo(a.x - c.x + Math.cos(theta + Math.PI*3/4) * grid_size/2, a.y - c.y + Math.sin(theta + Math.PI*3/4) * grid_size/2);
        }

        ctx.restore();
    }

    this.render = function(ctx) {

        let a = this.properties[frame];
        let b = this.properties[next_frame];

        if (!a) {
            return;
        }

        let props = interpolate(a, b);

        ctx.beginPath();

        this.draw_path(props);

        ctx.save();
        ctx.globalAlpha = props.c[3];

        ctx.strokeStyle = rgbToHex(props.c);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
}

function Circle(color, pos) {
    this.type = "Circle";
    this.guid = guid();
    this.properties = {};
    this.properties[frame] = {p: pos, c: color, a_s:0, a_e: Math.PI*2.0, w: 1, h: 1, r: 0};
    this.selected = false;

    this.select = function() {
        this.selected = true;
    }

    this.is_selected = function() {
        return this.selected;
    }

    this.hidden = function() {
        if (!this.properties[frame]) {
            return true;
        }
        
        return this.properties[frame].c[3] == 0;
    }

    this.copy_properties = function(f, n) {
        this.properties[n] = copy(this.properties[f]);
    }

    this.duplicate = function() {
        if (!this.selected) {
            return;
        }

        let newc = new Circle(null, null);
        newc.properties[frame] = copy(this.properties[frame]);
        newc.selected = true;
        this.selected = false;
        objs.push(newc);
    }

    this.hide = function() {
        if (this.selected) {
            if (this.properties[frame].c[3] == 1) {
                this.properties[frame].c[3] = 0;
            } else {
                this.properties[frame].c[3] = 1;
            }
            this.selected = false;
        }
    }

    this.set_color = function(rgba) {
        if (this.selected) {
            rgba[3] = this.properties[frame].c[3];
            this.properties[frame].c = rgba;
        }
    }

    this.clear_props = function(f) {
        delete this.properties[f];
    }

    this.clear_all_props = function() {
        if (!this.selected) {
            return;
        }

        for (var key in this.properties) {
            if (key != frame) {
                delete this.properties[key];
            }
        }
    }

    this.near_mouse = function () {
        let props = this.properties[frame];
        if (!props) {
            return false;
        }

        return distance(props.p, mouse) < grid_size/2
    }

    this.in_rect = function(x, y, x2, y2) {
        if (this.hidden()) {
            return false;
        }

        let props = this.properties[frame];
        let p = props.p;

        if (p.x > x && p.x < x2 && p.y > y && p.y < y2) {
            this.selected = true;
            return true;
        }

        return false;
    }

    this.onkeydown = function(evt) {
        if (!this.selected) {
            return false;
        }

        let key = evt.key;

        if (ctrl) {
            let p = this.properties[frame];
            let step = Math.PI/12;
            if (key == "u") {
                p.a_s += step;
            } else if (key == "o") {
                p.a_s -= step;
            } else if (key == "j") {
                p.a_e -= step;
            } else if (key == "l") {
                p.a_e += step;
            }
        } else {
            this.properties[frame] = transform_props(key, this.properties[frame]);
        }

        return false;
    }

    this.mouse_down = function(evt) {
        if (this.hidden()) {
            return false;
        }

        // try to selected one
        if (this.near_mouse()) {
            this.selected = true;
            return true;
        }

        return false;
    }

    this.mouse_drag = function(evt) {
        if (this.selected && tool == "select") {
            // move
            let props = this.properties[frame];
            let offset = {x: mouse_grid.x - mouse_grid_last.x,
                        y: mouse_grid.y - mouse_grid_last.y};
            let p = props.p;
            this.properties[frame].p = {x: p.x + offset.x, y: p.y + offset.y};
        }
    }

    this.mouse_up = function(evt) {
        if (meta) {
            return;
        }

        this.selected = false;
    }

    this.draw_ellipse = function(props, ctx) {
        let p = props.p;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(props.r);
        ctx.scale(props.w, props.h);
        ctx.arc(0, 0, 20, props.a_s, props.a_e, false);
        ctx.restore();
    }

    this.render = function(ctx) {

        let a = this.properties[frame];
        let b = this.properties[next_frame];

        if (!a) {
            return;
        }

        let props = interpolate(a, b);

        ctx.save();

        ctx.beginPath();
        ctx.fillStyle = "#ffffff";
        this.draw_ellipse(props, ctx);
        ctx.globalAlpha = props.c[3];
        ctx.strokeStyle = rgbToHex(props.c);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();

        if (!presenting && props.c[3] != 0 && (this.selected || this.near_mouse())) {
            ctx.beginPath();
            ctx.strokeStyle = dark;
            ctx.strokeRect(props.p.x - grid_size/4, props.p.y - grid_size/4, grid_size/2, grid_size/2);
            ctx.stroke();
        }
    }
}

function Text(text, pos) {
    this.type = "Text";
    this.guid = guid();
    this.properties = {};
    this.properties[frame] = {t: text, p: pos, c: [0, 0, 0, 1], w: 1, h: 1, r: 0};

    // ephemeral
    this.new = true; // loaded or just created
    this.selected = false;
    this.dragged = false;
    this.cursor = -1;
    this.command = "";
    this.args = [];
    this.cargs = []; // compiled arguments
    this.text_val = "";
    this.near_mouse = false;
    this.size = {w:0, h:0}; // pixel width and height

    this.select = function() {
        this.selected = true;

        if (this.cursor == -1) {
            this.cursor = 0;
        }
    }

    this.is_selected = function() {
        return this.selected;
    }

    this.duplicate = function() {
        if (!this.selected) {
            return;
        }

        let newc = new Text(this.text, null);
        newc.properties[frame] = copy(this.properties[frame]);
        newc.selected = true;
        this.selected = false;
        objs.push(newc);
    }

    this.copy_properties = function(f, n) {
        this.properties[n] = copy(this.properties[f]);
    }

    this.set_color = function(rgba) {
        if (this.selected) {
            rgba[3] = this.properties[frame].c[3];
            this.properties[frame].c = rgba;
        }
    }

    this.hide = function() {
        if (this.selected) {
            if (this.properties[frame].c[3] == 1) {
                this.properties[frame].c[3] = 0;
            } else {
                this.properties[frame].c[3] = 1;
            }
            
            this.selected = false;
        }
    }

    this.clear_props = function(f) {
        delete this.properties[f];
    }

    this.clear_all_props = function() {
        if (!this.selected) {
            return;
        }

        for (var key in this.properties) {
            if (key != frame) {
                delete this.properties[key];
            }
        }
    }

    this.hidden = function() {
        if (!this.properties[frame]) {
            return true;
        }

        if (transition.transitioning) {
            return this.properties[frame].c[3] == 0 && this.properties[next_frame].c[3] == 0;
        }

        return this.properties[frame].c[3] == 0;
    }

    this.in_rect = function(x, y, x2, y2) {
        if (this.hidden()) {
            return false;
        }

        let props = this.properties[frame];
        let p;
        if (props.ge) {
            p = {x: props.p.x + cam.props.p.x, y: props.p.y + cam.props.p.y};
        } else {
            p = props.p;
        }
        
        if (p.x > x && p.y > y && p.x < x2 && p.y < y2) {
            this.select();
            return true;
        }

        return false;
    }

    this.split = function() {
        if (!this.is_selected()) {
            return;
        }

        // for each character, make it it's own text obj
        let t = this.properties[frame].t;
        if (!t) {
            return;
        }

        let p = this.properties[frame].p;

        let N = t.length;
        let xoff = 0;
        for (let i = 0; i < N; i++) {
            let c = t[i];
            if (c == " ") {
                xoff += grid_size/2;
                continue;
            }
            let newT = new Text(c, {x: p.x + xoff, y:p.y});
            objs.push(newT);
            xoff += grid_size/2;
        }

        this.deleted = true;
    }

    this.onkeydown = function(evt) {
        if (!this.selected) {
            return false;
        }

        if (meta) {
            return false;
        }

        let key = evt.key;
        let text = this.properties[frame].t;

        if (key == "Escape") {
            this.selected = false;
            return false;
        }

        if (key == "Enter") {
            this.selected = false;
            this.eval();
            enter_select();
            return false;
        }

        if (ctrl) {
            this.properties[frame] = transform_props(key, this.properties[frame]);
            return false;
        }

        if (key == "ArrowRight") {
            this.cursor += 1;
        } else if (key == "ArrowLeft") {
            this.cursor -= 1;
        } else if (key == "ArrowUp") {
            // find text above
            let texts = objs.filter(function(o) {
                return o.type == "Text";
            });

            texts.sort(function(a, b) {
                let ap = a.properties[frame].p;
                let bp = b.properties[frame].p;
                return ap.y > bp.y;
            });

            let i = guidIndex(texts, this);
            if (i == 0) {
                return true;
            }

            let new_obj = texts[i-1];
            new_obj.selected = true;
            this.selected = false;
            return true;

        } else if (key == "ArrowDown") {
            // find text below
            let texts = objs.filter(function(o) {
                return o.type == "Text";
            });

            texts.sort(function(a, b) {
                let ap = a.properties[frame].p;
                let bp = b.properties[frame].p;
                return ap.y > bp.y;
            });

            let i = guidIndex(texts, this);
            if (i == texts.length - 1) {
                return true;
            }

            let new_obj = texts[i+1];
            new_obj.selected = true;
            this.selected = false;
            return true;
        }

        if (key == 'Backspace') {
            let before = text.slice(0, this.cursor);
            let after = text.slice(this.cursor, text.length);
            this.cursor -= 1;
            
            text = before.slice(0, before.length-1) + after;
        } else if (key.length == 1) {
            let before = text.slice(0, this.cursor);
            let after = text.slice(this.cursor, text.length);

            text = before + key + after;
            this.cursor += 1;
        }

        if (this.cursor > text.length) {
            this.cursor = text.length;
        } else if (this.cursor < 0) {
            this.cursor = 0;
        }

        this.change_text(text);

        return true;
    }

    this.eval = function() {
        if ((!presenting && this.is_selected()) || this.hidden()) {
            return;
        }

        this.text_val = "";
        let expr = "";

        if (this.new) {
            this.new = false;
            this.parse_text(this.properties[frame].t);
        }

        let c = this.cargs[0];

        if (!c) {
            return;
        }

        ctx.save();

        let a = this.properties[frame];
        let b = this.properties[next_frame];
        let i = interpolate(a, b);

        let color = rgbToHex(i.c);

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = i.c[3];

        try {
            let val = c.eval(parser.scope);
            let type = typeof val;
            if (type == "number") {
                if (ctrl) {
                    // nothing
                    this.text_val = ' = ' + val;
                } else {
                    this.text_val = ' = ' + pretty_round(val);
                }
                
            } else if (type == "object" && val._data && val._data.length != 0) {
                // prob a matrix, render dims
                let d = val._data;
                let dims = [];

                while (d.length) {
                    dims.push(d.length);
                    d = d[0];
                }

                this.text_val = ' = [';
                let N = dims.length;
                for (let i = 0; i < N; i++) {
                    this.text_val += dims[i];
                    if (i != N - 1) {
                        this.text_val += ', ';
                    }
                }
                this.text_val += ']';
            } else {
                if (val) {
                    this.text_val = ' = ' + val.toString();
                }
            }
        } catch (e) {
            console.log('eval error:');
            console.log(e);
        }
        
        ctx.restore();
    }

    this.change_text = function(text) {
        let changed = this.properties[frame].t != text;

        this.properties[frame].t = text;

        if (changed) {
            this.parse_text(text);
        }
    }

    this.mouse_down = function(evt) {
        if (this.hidden()) {
            return false;
        }

        this.near_mouse = this.point_in_text_rect(mouse);
        
        if (this.near_mouse) {
            return true;
        }

        return false;
    }

    this.point_in_text_rect = function(point) {
        let props = this.properties[frame];
        if (!props) {
            return false;
        }

        let p = props.p;
        if (point.x > p.x && point.x < p.x + this.size.w && point.y > p.y - this.size.h/2 && point.y < p.y + this.size.h/2) {
            return true;
        }

        return false;
    }

    this.mouse_move = function(evt) {
        let props = this.properties[frame];
        if (!props) {
            return;
        }

        
        this.near_mouse = this.point_in_text_rect(mouse);
    };

    this.slide_var_name = function() {
        let var_name = this.args[0];
        var_name = var_name.replace(/\s+/g, '');
        return var_name;
    }

    this.mouse_drag = function(evt) {
        let props = this.properties[frame];
        if (!props) {
            return false;
        }

        if (presenting) {
            if (this.command == "slide" && this.point_in_text_rect(mouse_start)) {

                // change the value of the variable
                let var_name = this.slide_var_name();

                let old_val = 0;
                try {
                    old_val = parser.eval(var_name);
                } catch(e) {

                }

                if (isNaN(old_val)) {
                    old_val = 0;
                }

                let delta = (mouse.x - mouse_last.x)/grid_size;

                let new_val = old_val + delta;
                this.text_val = ' = ' + pretty_round(new_val);
                this.properties[frame]['sval'] = new_val;

                try {
                    parser.set(var_name, new_val);
                } catch (error) {
                    console.log('slide error: ' + error);
                }

                return true;
            }
        } else if (tool == "select" && (this.near_mouse || this.is_selected())) {
            // shift it
            this.dragged = true;
            let p = props.p;
            let offset = {x: mouse_grid.x - mouse_grid_last.x, y: mouse_grid.y - mouse_grid_last.y};
            props.p = {x: p.x + offset.x, y: p.y + offset.y};

            return true;
        }

        return false;
    }

    this.mouse_up = function(evt) {
        if (presenting) {
            if (this.near_mouse) {
                // clicked, eval text

                // loop:num,expr
                if (this.command == "loop") {
                    try {
                        let num = this.args[0];
                        let expr = this.args[1];
                        for (let i = 0; i < num; i++) {
                            parser.eval(expr);
                        }
                    } catch(e) {
                        console.log('loop error ' + e);
                    }
                } else {
                    this.eval();
                }
            }
            return;
        }
        
        if (this.near_mouse) {
            if (!this.dragged) {
                this.selected = true;
                // move cursor
                let p = this.properties[frame].p;
                let t = this.properties[frame].t;
                this.cursor = Math.round((mouse.x - p.x)/char_size);
                this.cursor = Math.min(this.cursor, t.length);
            }
        } else if (!meta && this.is_selected()) {
            this.selected = false;
        }
        
        this.dragged = false;
    }

    this.graphing = function() {
        let cs = ["tangent", "graph", "point", "scatter", "drag", "line", "contour"];

        if (cs.indexOf(this.command) != -1) {
            return true;
        }

        return false;
    }

    this.draw_text = function(ctx, props) {
        let t = props.t;
        let size;

        let c = rgbToHex(props.c);
        ctx.fillStyle = c;
        ctx.strokeStyle = ctx.fillStyle;

        let draw_val = false;
        if (this.command == "e" || this.command == "slide") {
            // draw the value
            if (presenting) {
                t = t.split(":")[1];
            }

            draw_val = true;
        }

        if (!this.is_selected() && this.command == "f") {
            let fn = t.slice(this.command.length+1); //+1 for semicolon
            size = draw_fn(fn);
        } else {
            let N = t.length;
            let plevel = 0;
            size = {w: N * char_size, h:char_size*2};
            for (let i = 0; i < N; i++) {
                if (i < this.cursor) {
                    if (t[i] in brackets) plevel += brackets[t[i]];
                }
                
                ctx.fillText(t[i], i * char_size, 0);
            }
            
            if (this.is_selected() && plevel != 0) {
                ctx.fillStyle = colors[1];
                let p2 = plevel;
                for (let i = this.cursor; i < N; i++) {
                    if (t[i] in brackets) p2 += brackets[t[i]];

                    if (p2 == plevel-1) {
                        ctx.fillText(t[i], i * char_size, 0);
                        break;
                    }
                }

                p2 = plevel;
                for (let i = this.cursor-1; i >= 0; i--) {
                    if (t[i] in brackets) p2 += brackets[t[i]];

                    if (p2 == plevel+1) {
                        ctx.fillText(t[i], i * char_size, 0);
                        break;
                    }
                }
            }
        }

        ctx.fillStyle = c;

        if (draw_val) {
            ctx.save();
            ctx.translate(size.w, 0);
            size.w = size.w + draw_simple(this.text_val);
            ctx.restore();
        }

        return size;
    }

    this.parse_text = function(text) {
        this.command = "";
        this.args = [];
        this.cargs = [];

        if (!text) {
            return;
        } else if (text.indexOf(':') == -1) {
            this.args = [text];
            try {
                this.cargs = math.compile(this.args);
            } catch(e) {
                console.log('compile2 error: ');
                console.log(e);
            }
            return;
        }

        // find top level command and args
        let N = text.length;
        let p = 0;
        let s = 0;

        for (let i = 0; i < N; i++) {
            let c = text[i];

            if (c == "(" || c == "[") {
                p += 1;
            } else if (c == ")" || c == "]") {
                p -= 1;
            }

            if (c == ':' && p == 0) {
                this.command = text.slice(s, i);
                s = i+1;
            }else if (c == ',' && p == 0) {
                this.args.push(text.slice(s, i));
                s = i+1;
            }
        }

        this.args.push(text.slice(s));
        try {
            this.cargs = math.compile(this.args);
        } catch(e) {
            console.log('compile error: ');
            console.log(e);
        }
    }

    this.parse_text(text);

    this.draw_tree = function(ctx, props) {

        if (this.args.length != 1) {
            return;
        }

        let t = -1;

        try {
            t = math.parse(this.args[0]);
        } catch(e) {

        }

        if (t == -1) {
            return;
        }

        let yoff = grid_size*3;
        let xoff = grid_size*3;
        let op_size = grid_size;

        let p = {x: props.p.x, y: props.p.y + grid_size};
        let stuff = [t];

        if (!stuff) {
            return;
        }

        while (true) {

            let next_stuff = [];
            let added_all_spaces = true;
            for (let i = 0; i < stuff.length; i ++) {
                let o = stuff[i];
                if (o.args) {
                    next_stuff = next_stuff.concat(o.args);
                    added_all_spaces = false;
                } else {
                    next_stuff.push(' ');
                }
            }
            
            
            let lx = -(next_stuff.length-1)/2*xoff;
            let li = 0;

            for (let i = 0; i < stuff.length; i ++) {

                let o = stuff[i];
                if (o == ' ') {
                    continue;
                }

                let text;
                let np = {x: p.x + i * xoff - (stuff.length-1)/2*xoff, y: p.y};

                if (o.args) {
                    // draw the op name

                    if (o.name && o.name.length) {
                        text = o.name;
                    } else if (o.op && o.op.length) {
                        text = o.op;
                    }

                    if (distance(mouse, np) < grid_size) {
                        text = o.toString();
                    }
                    
                    ctx.beginPath();
                    ctx.arc(np.x, np.y, op_size, 0, pi2);
                    ctx.stroke();

                    ctx.fillText(text, np.x, np.y);

                    for (let j = 0; j < o.args.length; j++) {
                        while(next_stuff[li] == ' ') {
                            lx += xoff;
                            li += 1;
                        }

                        let argp = {x: p.x + lx, y: np.y + yoff};
                        let diff = {x: argp.x - np.x, y: argp.y - np.y};
                        let n = math.norm([diff.x, diff.y]);
                        diff = {x: diff.x/n, y: diff.y/n};

                        ctx.beginPath();
                        ctx.moveTo(np.x + diff.x*op_size, np.y + diff.y*op_size);
                        ctx.lineTo(argp.x - diff.x*op_size, argp.y - diff.y*op_size);
                        ctx.stroke();

                        lx += xoff;
                        li += 1;
                    }
                } else {

                    if (o.name && o.name.length) {
                        text = o.name;
                    } else if (o.items) {
                        text = 'A'; // array
                    } else if (o.value) {
                        text = o.value;
                    } else if (o.content) {
                        text = 'G';
                    } else {
                        text = '?';
                    }

                    
                    ctx.fillText(text, np.x, np.y);
                }
            }

            if (next_stuff.length == 0) {
                break;
            }
            
            if (added_all_spaces) {
                break;
            }

            stuff = next_stuff;
            p.y += yoff;
        }

        
        // recursively draw it
        /*
        function render_tree(ctx, t, p, info) {
            if (t.args) {
                if (t.name && t.name.length) {
                    ctx.fillText(t.name, p.x, p.y);
                } else if (t.op && t.op.length) {
                    ctx.fillText(t.op, p.x, p.y);
                } else {
                    ctx.fillText('op', p.x, p.y);
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, grid_size/2, 0, pi2);
                ctx.stroke();

                info[info.level] = t.args.length;
                info.level += 1;

                let x = 0;
                for (let i = 0; i < t.args.length; i ++) {
                    
                    x = p.x + info.xo;
                    info.xo = info.xo + grid_size;

                    let np = {x: x, y: p.y + grid_size*2};
                    let diff = {x: np.x-p.x, y: np.y - p.y};

                    ctx.beginPath();
                    ctx.moveTo(p.x + diff.x*.2, p.y + diff.y*.2);
                    ctx.lineTo(p.x + diff.x*.8, p.y + diff.y*.8);
                    ctx.stroke();

                    render_tree(ctx, t.args[i], np, info);
                }
            } else if (t.content) {
                render_tree(ctx, t.content, p, info);
            } else {
                
                if (t.name && t.name.length) {
                    ctx.fillText(t.name, p.x, p.y);
                } else {
                    ctx.fillText(t.value, p.x, p.y);
                }
            }
        }

        let info = {xo: 0, level:0};
        render_tree(ctx, t, {x: props.p.x, y: props.p.y + grid_size}, info);
        console.log(info); */
    }

    this.draw_tangent = function(ctx, props) {

        ctx.save();

        try {
            let c = this.cargs[0];

            ctx.translate(cam.props.p.x, cam.props.p.y);

            let inx = mouse_graph.x;

            parser.set('x', inx);
            let p0 = {x: inx, y: -c.eval(parser.scope)};

            inx += 0.0001;
            parser.set('x', inx);
            let p1 = {x: inx, y: -c.eval(parser.scope)};

            let slope = (p1.y - p0.y)/(p1.x - p0.x);

            let s = 100;
            let p0_extend = {x: p0.x - s * grid_size, y: p0.y - s * grid_size * slope};
            let p1_extend = {x: p0.x + s * grid_size, y: p0.y + s * grid_size * slope};

            let path = [p0_extend, p1_extend];

            // for (let xx = -uw; xx <= uw; xx += uw) {
            //     let y = math.eval(expr, {x: xx});
            //     y = Math.max(Math.min(y, 1000), -1000);
            //     path.push({x: grid_size * xx, y: -grid_size * y});
            // }

            ctx.beginPath();

            for (let i = 0; i < path.length; i++) {
                let p = path[i];
                
                if (i == 0) {
                    ctx.moveTo(p.x * grid_size * cam.props.w, p.y * grid_size * cam.props.h);
                } else {
                    ctx.lineTo(p.x * grid_size * cam.props.w, p.y * grid_size * cam.props.h);
                }
            }

            ctx.stroke();

        } catch (error) {
        }

        ctx.restore();
    }

    this.draw_contour = function(ctx, props) {
        // contour: f, steps, step_size

        if (this.args.length != 3) {
            return;
        }

        ctx.save();

        try {
            ctx.fillStyle = rgbToHex(props.c);

            let cexpr = this.cargs[0];
            let steps = this.cargs[1].eval(parser.scope);
            let step_size = this.cargs[2].eval(parser.scope);

            let sx = mouse_graph.x;
            let sy = mouse_graph.y;

            parser.set('x', sx);
            parser.set('y', sy);

            let cont_v = cexpr.eval(parser.scope);

            ctx.fillText(pretty_round(cont_v), mouse.x, mouse.y-grid_size/2);

            ctx.beginPath();
            let p = cam.graph_to_screen(sx, sy, 0);
            ctx.moveTo(p[0], p[1]);

            for (let i = 0; i < steps; i++) {
                let grad = grad_2(cexpr, sx, sy);
                let perp = [grad[1], -grad[0]];
                let norm = Math.sqrt(perp[0]**2 + perp[1]**2);
                perp = [step_size * perp[0] / norm, step_size * perp[1] / norm];

                sx += perp[0];
                sy += perp[1];

                // auto correct
                /*
                for (let j = 0; j < 5; j++) {
                    parser.set('x', sx);
                    parser.set('y', sy);
                    let new_v = cexpr.eval(parser.scope);

                    let diff = new_v - cont_v;
                    grad = grad_2(cexpr, sx, sy);
                    sx -= .01 * diff * grad[0];
                    sy -= .01 * diff * grad[1];
                } */
                
                p = cam.graph_to_screen(sx, sy, 0);
                ctx.lineTo(p[0], p[1]);
            }

            ctx.stroke();

        } catch(e) {
            console.log('contour error: ');
            console.log(e);
        }

        ctx.restore();
    }

    this.draw_border = function(ctx) {
        ctx.strokeStyle = dark;
        ctx.beginPath();
        let pad = 4;
        ctx.strokeRect(-pad, -this.size.h/2-pad, this.size.w+pad*2, this.size.h+pad*2);
    }

    this.render = function(ctx) {

        let a = this.properties[frame];

        if (!a) {
            return;
        }

        let b = this.properties[next_frame];
        let i = interpolate(a, b);

        let pos = i.p;

        ctx.save();

        ctx.globalAlpha = i.c[3];
        ctx.fillStyle = rgbToHex(i.c);
        ctx.strokeStyle = rgbToHex(i.c);

        let should_draw_text = true;

        let c = this.command;
        if (c == "tangent") {
            this.draw_tangent(ctx, i);
        } else if (c == "tree") {
            this.draw_tree(ctx, i);
            if (presenting) {
                should_draw_text = false;
            }
        } else if (c == "contour") {
            this.draw_contour(ctx, i);
        }

        if (presenting && (a.ph || (b && b.ph))) {
            should_draw_text = false;
        }

        // text
        this.size = {w: 0, h: 0};
        if (should_draw_text) {

            ctx.translate(i.p.x, i.p.y);
            ctx.rotate(i.r);
            ctx.scale(i.w, i.h);

            if (b && b.c[3] != 0 && a.t != b.t && transition.transitioning) {
                // changing text
                let constrained = constrain(t_ease);
                ctx.globalAlpha = 1-constrained;
                this.draw_text(ctx, a);
                ctx.globalAlpha = constrained;
                this.draw_text(ctx, b);
            } else {
                ctx.globalAlpha = i.c[3];
                this.size = this.draw_text(ctx, i);
            }
        }

        if (c == "slide" && a && b) {
            // interpolate variable value! oh boy...
            let var_name = this.slide_var_name();
            let va = this.properties[frame]['sval'];
            let vb = this.properties[next_frame]['sval'];
            if (!isNaN(va) && !isNaN(vb)) {
                let new_val = va * (1-t_ease) + vb * (t_ease);
                this.text_val = " = " + pretty_round(new_val);
                try {
                    parser.set(var_name, new_val);
                } catch(e) {

                }
            }
        }

        if (c == "slide" && presenting && this.near_mouse && !this.hidden()) {
            // draw slider rect
            this.draw_border(ctx);
        }
        
        if (!presenting && !this.hidden() && this.near_mouse) {
            // draw border
            this.draw_border(ctx);
        }

        if (this.is_selected()) {
            // draw cursor
            ctx.beginPath();
            ctx.fillRect(this.cursor * grid_size/2, -grid_size/2, 2, grid_size);

            // draw function information
            let fn = function_before_i(i.t, this.cursor);
            if (fn.length && math[fn]) {
                ctx.save();
                ctx.translate(0, char_size*2);
                ctx.scale(.5, .5);
                ctx.globalAlpha = .5;
                draw_simple((math[fn]+"").split("\n")[0]);
                ctx.restore();
            }
        }

        ctx.restore();
    }
}

function Camera() {
    this.default_props = {p: {x:c.width/2, y:c.height/2}, w: 1, h: 1, rxyz: [0, 0, 0]};
    this.properties = {};
    this.properties[frame] = copy(this.default_props);

    function generate_ticks() {
        let ticks = [];

        var R = math.range(-10,10,1);
        let N = R.size()[0];
        let m = [];
        let tick_size = .2;

        for (let i = 0; i < 3; i++) {
            
            for (let j = 0; j < N; j++) {
                let t = R._data[j];
                if (i == 0) {
                    m.push([t, -tick_size, 0]);
                    m.push([t, tick_size, 0]);
                } else if (i == 1) {
                    // y axis
                    m.push([-tick_size, t, 0]);
                    m.push([tick_size,  t, 0]);
                } else if (i == 2) {
                    // z axis
                    m.push([-tick_size, 0, t]);
                    m.push([tick_size, 0, t]);
                }
            }

            ticks.push(m);
        }

        return ticks;
    }

    this.ticks = generate_ticks();

    this.mouse_drag = function(evt) {
        if (tool != "camera") {
            return;
        }

        let props = this.properties[frame];

        if (meta) {
            // rotate
            let r = props.rxyz;
            r = [r[0] + (mouse.y - mouse_last.y)/100, r[1] + (mouse.x - mouse_last.x)/100, 0];
            props.rxyz = r;
        } else {
            // translate
            let p = props.p;
            let offset = {x: mouse_grid.x - mouse_grid_last.x, y: mouse_grid.y - mouse_grid_last.y};
            props.p = {x: p.x + offset.x, y: p.y + offset.y};
        }
    }

    this.onkeydown = function(evt) {
        if (tool != "camera") {
            return;
        }

        let key = evt.key;
        this.properties[frame] = transform_props(key, this.properties[frame]);
    }

    this.update_props = function() {
        let a = this.properties[frame];
        let b = this.properties[next_frame];

        if (!a) {
            this.properties[frame] = copy(this.default_props);
            this.props = this.properties[frame];
            return;
        }

        if (a && !b) {
            this.properties[next_frame] = copy(a);
            this.props = a;
            return;
        }

        this.props = interpolate(a, b);

        // transform matrix T
        let rx = this.props.rxyz[0];
        let ry = this.props.rxyz[1];
        let rz = this.props.rxyz[2];

        this.R = rotation_matrix(rx, ry, rz);

    }

    this.graph_to_screen = function(x, y, z) {
        // takes array [x, y, z]
        // returns [x, y, z] projected to screen (render using first two coords)
        return this.graph_to_screen_mat(math.matrix([[x, y, z]]))[0];
    }

    this.graph_to_screen_mat = function(p) {
        // n x ?
        let size = p.size();
        let n = size[0];
        let d = size[1];

        if (d == 2) {
            // 2d
            // append zeros for zs
            p = p.resize([n, 3]);
        }

        p = math.multiply(p, this.R);
        p = p._data;

        let x; let y; let z; let m;
        for (let i = 0; i < n; i++) {
            x = p[i][0];
            y = p[i][1];
            z = p[i][2];

            /*
            m = z/20+1;
            if (m < 0) {
                m = 1;
            } */

            p[i] = [x * this.props.w * grid_size + this.props.p.x, -y * this.props.h * grid_size + this.props.p.y, z];
        }

        return p;
    }

    this.screen_to_graph = function(p) {
        return {x: (p.x-this.props.p.x)/(grid_size * this.props.w), y:-(p.y - this.props.p.y)/(grid_size * this.props.h)};
    }
}

function save_state() {
    // save state
    let str = state_to_string();
    if (states.length > 0) {
        let last = states[states.length-1];
        if (str != last) {
            states.push(str);
        }
    } else {
        states = [str];
    }
}

function undo() {
    if (states.length > 0) {
        states = states.splice(0, states.length-1);
        str_to_state(states[states.length-1]);
    }
}

function guidIndex(objs, obj) {
    let N = objs.length;
    for (let i = 0; i < N; i ++) {
        let tobj = objs[i];
        if (tobj.guid == obj.guid) {
            return i;
        }
    }

    return -1;
}

function state_to_string() {
    return JSON.stringify({"num_frames": num_frames, "frame": frame, "objs": objs, "cam": cam});
}

function str_to_state(str) {
    let dict = JSON.parse(str);
    let arr = dict["objs"];

    num_frames = dict["num_frames"];
    frame = dict["frame"];
    frames.create_buttons();

    objs = text_array_to_objs(arr, true);
    cam = new Camera();
    cam.properties = dict.cam.properties;
}

function save(objs) {
    let str = state_to_string();
    var blob = new Blob([str], {type: "text/plain;charset=utf-8"});
    let name = document.getElementById("name").value;
    saveAs(blob, name);
}

function load(evt) {

    let files = evt.target.files; // FileList object
    let f = files[0];

    var reader = new FileReader();

    // Closure to capture the file information.
    reader.onload = (function(theFile) {
        return function(e) {
            let string = e.target.result;
            str_to_state(string);
        };
    }
    )(f);

    reader.readAsText(f);
}

function text_array_to_objs(arr, keep_animation) {
    
    let new_objs = [];
    for (let i = 0; i < arr.length; i++) {
        let o = arr[i];
        let new_obj = null;

        if (o.type == "Shape") {
            new_obj = new Shape();
        } else if (o.type == "Circle") {
            new_obj = new Circle();
        } else if (o.type == "Text") {
            new_obj = new Text();
        }

        if (keep_animation) {
            new_obj.properties = o.properties;
        } else {
            new_obj.properties = {};
            new_obj.properties[frame] = o.properties[1];
            new_obj.select();
        }

        new_obj.guid = o.guid;
        
        new_objs.push(new_obj);
    }

    return new_objs;
}

function Frames(pos) {
    this.pos = pos;
    this.size = grid_size/2;

    this.frame_pos = function(i) {
        let size = (this.size + grid_size/4);
        let yoffset = (i-1) * size;
        let xoff = 0;
        let hcon = size * 30;
        while (yoffset >= hcon) {
            yoffset -= hcon;
            xoff ++;
        }
        return {x: this.pos.x + xoff * grid_size*2/3, y: this.pos.y + yoffset + grid_size/2};
    }

    this.create_buttons = function() {
        this.buttons = [];
        for (let i = 1; i <= num_frames; i++) {
            let newb = new Button(''+i, this.frame_pos(i), null);
            this.buttons.push(newb);
        }
        this.buttons.push(new Button("-", this.frame_pos(num_frames+1), null));
        this.buttons.push(new Button("+", this.frame_pos(num_frames+2), null));
    };

    this.create_buttons();

    this.mouse_down = function(evt) {
        for (let i = 0; i < this.buttons.length; i++) {
            let btn = this.buttons[i];
            if (btn.hovering()) {
                return true;
            }
        }

        return false;
    }

    this.mouse_up = function(evt) {
        for (let i = 0; i < this.buttons.length; i++) {
            let btn = this.buttons[i];
            if (btn.mouse_up(evt)) {
                if (i == this.buttons.length - 2) {
                    // remove frame

                    // remove selected frame
                    // copy properties from next frames
                    // decrement number of frames
                    if (num_frames == 1) {
                        break;
                    }

                    for (let f = frame; f <= num_frames; f ++) {
                        for (let i = 0; i < objs.length; i++) {
                            let obj = objs[i];
                            if (typeof obj.copy_properties == "function") {
                                if (!obj.properties[f]) {
                                    continue;
                                }
                                if (!obj.properties[f+1]) {
                                    continue;
                                }
                                obj.copy_properties(f+1, f);
                            }
                        }

                        if (cam.properties[f] && cam.properties[f+1]) {
                            cam.properties[f] = copy(cam.properties[f+1]);
                        }
                    }

                    num_frames -= 1;
                    this.create_buttons();
                    return true;

                } else if (i == this.buttons.length - 1) {
                    // add frame
                    // copy to next from frame
                    insert_frame();
                    return true;
                } else {
                    this.on_click(i+1);
                }
            }
        }
    }

    this.onkeydown = function(evt) {
        let key = evt.key;

        if (key == "ArrowRight") {
            if (!presenting && frame + 1 > num_frames) {
                // create a new one
                insert_frame();
            }

            transition_with_next(loop_frame(frame+1));
            return true;
        } else if (key == "ArrowLeft") {
            transition_with_next(loop_frame(frame-1));
            return true;
        }

        return false;
    }

    this.render = function(ctx) {
        for (let i = 1; i <= this.buttons.length; i++) {
            let btn = this.buttons[i-1];
            btn.selected = false;
            if (btn.text == ''+frame) {
                btn.selected = true;
            }
            btn.render(ctx);
        }
    }
}

function insert_frame() {
    num_frames += 1;
    for (let f = num_frames; f >= frame; f--) {
        for (let i = 0; i < objs.length; i++) {
            let obj = objs[i];
            if (typeof obj.copy_properties == "function") {
                if (!obj.properties[f]) {
                    continue;
                }
                obj.copy_properties(f, f+1);
            }
        }

        if (cam.properties[f]) {
            cam.properties[f+1] = copy(cam.properties[f]);
        }
    }
    frames.create_buttons();
}

function present() {
    tool = "select";
    presenting = true;
    document.body.style.cursor = 'none';
}

function Menu(pos) {
    this.pos = pos;
    this.buttons = [];

    this.buttons.push(new Button("select", {x: 0, y: 0}, function(b) {
        enter_select();
    }));

    this.buttons.push(new Button("text", {x: 0, y: 0}, function(b) {
        tool = "text";
    }));

    this.buttons.push(new Button("split", {x: 0, y: 0}, function(b) {
        let N = objs.length;
        for (let i = 0; i < N; i++) {
            let obj = objs[i];
            if (typeof obj.split == "function") {
                obj.split();
            }
        }
    }));

    this.buttons.push(new Button("shape", {x: 0, y: 0}, function(b) {
        tool = "shape";
    }));

    this.buttons.push(new Button("circle", {x: 0, y: 0}, function(b) {
        tool = "circle";
    }));

    this.buttons.push(new Button("vector", {x: 0, y: 0}, function(b) {
        tool = "vector";
    }));

    this.buttons.push(new Button("delete", {x: 0, y: 0}, function(b) {
        let N = objs.length;
        for (let i = 0; i < N; i++) {
            if (objs[i].is_selected()) {
                objs[i].deleted = true;
            }
        }
    }));

    this.buttons.push(new Button("clear props", {x: 0, y: 0}, function(b) {
        let N = objs.length;
        for (let i = 0; i < N; i++) {
            let obj = objs[i];
            if (typeof obj.clear_all_props == "function") {
                obj.clear_all_props();
            }
        }
    }));

    this.buttons.push(new Button("duplicate", {x: 0, y: 0}, function(b) {
        for (let i = objs.length-1; i >= 0; i--) {
            let obj = objs[i];
            if (typeof obj.duplicate == "function") {
                obj.duplicate();
            }
        }
    }));

    this.buttons.push(new Button("copy frame", {x: 0, y: 0}, function(b) {
        tool = "copy frame";
    }));

    this.buttons.push(new Button("hide", {x: 0, y: 0}, function(b) {
        let N = objs.length;
        for (let i = 0; i < N; i++) {
            let obj = objs[i];
            if (typeof obj.hide == "function") {
                obj.hide();
            }
        }
    }));

    this.buttons.push(new Button("pres. hide", {x: 0, y: 0}, function(b) {
        let N = objs.length;
        for (let i = 0; i < N; i++) {
            let obj = objs[i];
            if (obj.properties && obj.is_selected()) {
                obj.properties[frame]['ph'] = true;
            }
        }
    }));

    this.buttons.push(new Button("pres. show", {x: 0, y: 0}, function(b) {
        let N = objs.length;
        for (let i = 0; i < N; i++) {
            let obj = objs[i];
            if (obj.properties && obj.is_selected()) {
                obj.properties[frame]['ph'] = false;
            }
        }
    }));

    this.buttons.push(new Button("camera", {x: 0, y: 0}, function(b) {
        if (tool == "camera") {
            // reset cam
            cam.properties[frame] = cam.default_props;
        }
        tool = "camera";
    }));

    this.buttons.push(new Button("debug", {x: 0, y: 0}, function(b) {
        debug = !debug;
    }));

    this.buttons.push(new Button("present", {x: 0, y: 0}, function(b) {
        // show a cursor
        present();
    }));

    this.buttons.push(new Button("save local", {x: 0, y: 0}, function(b) {
        // Put the object into storage
        localStorage.setItem('page', state_to_string());
    }));

    this.buttons.push(new Button("load local", {x: 0, y: 0}, function(b) {
        // Put the object into storage
        let page = localStorage.getItem('page');
        if (page && page.length) {
            str_to_state(page);
        }
    }));

    for (let i = 0; i < colors.length; i++) {

        let b = new Button("", {x: 0, y: 0}, function(b) {
            let rgb = hexToRgb(colors[i]);

            for (let i = 0; i < objs.length; i++) {
                let obj = objs[i];
                if (typeof obj.set_color === "function") {
                    obj.set_color(rgb);
                }
            }
        });
        b.color = colors[i];
        this.buttons.push(b);
    }

    for (let i = 0; i < this.buttons.length; i++) {
        let b = this.buttons[i];
        b.pos = {x: this.pos.x, y: this.pos.y + i * 20};
    }

    this.mouse_up = function(evt) {
        for (let i = 0; i < this.buttons.length; i++) {
            let btn = this.buttons[i];
            if (btn.mouse_up(evt)) {
                return true;
            }
        }

        return false;
    }

    this.render = function(ctx) {
        ctx.fillStyle = "#000000";
        for (let i = 0; i < this.buttons.length; i++) {
            let b = this.buttons[i];
            b.selected = false;
            if (b.text == tool) {
                b.selected = true;
            }
            b.render(ctx);
        }
    };
}

function Transition() {
    this.steps = 0;
    this.step = 0;
    this.transitioning = false;
    this.target_frame = 0;
    this.complete;

    this.run = function(steps, target_frame, completion) {
        if (this.transitioning) {
            return;
        }

        t_percent = 0.0;
        t_ease = 0.0;
        this.steps = steps;
        this.target_frame = target_frame;
        this.transitioning = true;
        this.completion = completion;
    }

    this.update = function() {
        if (this.transitioning) {
            this.step += 1;
            t_percent = this.step / this.steps;
            parser.set('_t', t_percent);
            t_ease = ease_in_out(t_percent);
            parser.set('_tt', t_ease);
            t_ease = sigmoid(t_percent, 1.2, -.4, 14) - sigmoid(t_percent, .2, -.6, 15);
            if (this.step >= this.steps) {
                t_percent = 1.0;
                t_ease = 1.0;
                this.completion(this.target_frame);
                this.step = 0;
                this.transitioning = false;
            }
        }
    }
}

function constrain_frame(f) {
    return Math.max(1, Math.min(num_frames, f));
}

function constrain(v) {
    return Math.min(1, Math.max(0, v));
}

function loop_frame(f) {
    if (f >= num_frames + 1) {
        return 1;
    } else if (f < 1) {
        return num_frames;
    }

    return f;
}

function draw_grid(ctx) {
    if (!cam.R) {
        return;
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = .2;

    // center
    let c = cam.graph_to_screen_mat(math.matrix([[0, 0, 0]]));

    // axes
    let axes = math.matrix([[10, 0, 0],
                [0, 10, 0],
                [0, 0, 10],
                [-10, 0, 0],
                [0, -10, 0],
                [0, 0, -10]]);

    axes = cam.graph_to_screen_mat(axes);

    let labels = ['x', 'y', 'z'];
    let colors = ["#FF0000", "#00FF00", "#0000FF"];
    
    let N = axes.length;
    for (let i = 0; i < N; i ++) {
        ctx.fillStyle = colors[i%3];
        ctx.strokeStyle = colors[i%3];

        x = axes[i][0];
        y = axes[i][1];

        ctx.beginPath();
        ctx.moveTo(c[0][0], c[0][1]);
        ctx.lineTo(x, y);
        ctx.stroke();

        if (i < 3) {
            ctx.fillText(labels[i], x, y);
        }
    }

    /*
    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = colors[i%3];
        ctx.strokeStyle = colors[i%3];

        let axis = cam.ticks[i];
        axis = math.matrix(axis);
        axis = cam.graph_to_screen_mat(axis);
        let N = axis.length;
        for (let j = 0; j < N; j += 2) {
            ctx.beginPath();
            ctx.moveTo(axis[j][0], axis[j][1]);
            ctx.lineTo(axis[j+1][0], axis[j+1][1]);
            ctx.stroke();
        }
    } */

    ctx.restore();
}

function transition_with_next(next) {
    if (transition.transitioning) {
        return;
    }

    if (next > num_frames) {
        return;
    }

    if (tool == "copy frame") {
        enter_select();
        // copy properties
        for (let i = 0; i < objs.length; i ++) {
            let obj = objs[i];
            if (typeof obj.copy_properties === "function") {
                obj.copy_properties(frame, next);
            }
        }

        return;
    }

    new_line = null;
    next_frame = next;
    change_frames();
    let steps = t_steps;
    if (!presenting) {
        // make it instant when menu open
        steps = 0;
    }

    transition.run(steps, next, function(targ) {
        frame = targ;
        parser.set('frame', frame);

        let N = objs.length;
        for (let i = 0; i < N; i++) {
            let obj = objs[i];
            if (typeof obj.parse_text == 'function') {
                obj.parse_text(obj.properties[frame].t);
            }
        }
    });
}

function enter_select() {
    tool = "select";
    new_line = null;
}

function draw_cursor() {
    if (presenting && mouse_time > 0) {
        // draw a cursor

        let mx = mouse.x;
        let my = mouse.y;

        ctx.save();
        ctx.translate(mx, my);
        ctx.strokeStyle = dark;
        ctx.beginPath();

        if (mouse_down) {
            mouse_time = mouse_duration;
            
            ctx.arc(0, 0, 10, 0, pi2, 0);
            
        } else {
            let pad = 20;

            if (tool == "camera") {
                ctx.moveTo(-pad, 0);
                ctx.lineTo(pad, 0);
                ctx.moveTo(0, -pad);
                ctx.lineTo(0, pad);
            } else {
                ctx.moveTo(pad, 0);
                ctx.lineTo(0, 0);
                ctx.lineTo(0, pad);
                ctx.moveTo(0, 0);
                ctx.lineTo(pad, pad);
            }
        }

        ctx.stroke();
        ctx.restore();
    }
}

window.onload = function() {
    
    c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;

    ctx = c.getContext("2d");
    ctx.fillStyle = dark;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    var content = document.getElementById("content");
    content.appendChild(c);

    document.getElementById("save").onclick = function(evt) {
        save(objs);
        return false;
    };

    document.getElementById("file").onchange = function(evt) {
        enter_select();
        load(evt);
    };

    document.getElementById("load_to_frame").onclick = function(evt) {
        let text = document.getElementById("selected_objects_text").value;
        let arr = JSON.parse(text);
        objs = objs.concat(text_array_to_objs(arr, false));
    };

    document.getElementById("load_formula_text").onclick = function(evt) {
        let t = document.getElementById("formula_text").value;
        for (let i = 0; i < objs.length; i++) {
            let obj = objs[i];
            if (typeof obj.change_text == "function" && obj.is_selected()) {
                obj.change_text(t);
            }
        }
    };

    objs = [];

    transition = new Transition();
    frame = 1;
    frames = new Frames({x: c.width - grid_size*2, y: grid_size/4});
    frames.on_click = function(idx) {
        transition_with_next(idx);
    };

    menu = new Menu({x: grid_size/4, y: grid_size/2});
    cam = new Camera();

    window.onkeydown = function(evt) {
        let key = evt.key;


        if (presenting && tool != "camera" && key == "Escape") {
            presenting = false;
            document.body.style.cursor = '';
            return false;
        }

        if (key == "Escape") {
            enter_select();
        }

        if (key == "Meta") {
            meta = true;
        }

        if (key == "Control") {
            ctrl = true;
        }

        if (key == "Backspace") {
            if (ctrl) {
                let N = objs.length;
                for (let i = 0; i < N; i++) {
                    let obj = objs[i];
                    if (obj.is_selected()) {
                        obj.deleted = true;
                    }
                }
            }
        }

        if (key == "z" && meta) {
            undo();
            return;
        }

        if (key == "p" && ctrl) {
            present();
            return true;
        }

        if (document.getElementById("formula_text") == document.activeElement) {
            return true;
        }

        let captured = false;
        let N = objs.length;
        for (let i = 0; i < N; i++) {
            let obj = objs[i];

            if (typeof obj.onkeydown === 'function') {
                if (obj.onkeydown(evt)) {
                    captured = true;
                    if (key == "ArrowUp" || key == "ArrowDown") {
                        // stops text selection from propagating as you iterate the array
                        break;
                    }
                }
            }
        }

        if (captured) {
            return false;
        }

        if (frames.onkeydown(evt)) {
            return false;
        }

        cam.onkeydown(evt);

        if (key == " ") {
            return false;
        }

        if (tool == "select" && evt.srcElement == document.body) {
            tools = {'t': 'text', 's': 'shape', 'c': 'camera', 'v': 'vector'};
            if (key in tools) {
                tool = tools[key];
            }
        }

        
        if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].indexOf(Number(key)) != -1) {
            if (!transition.transitioning) {
                transition_with_next(Number(key));
            }
        }
    };

    window.onkeyup = function(evt) {
        let key = evt.key;
        if (key == "Meta") {
            meta = false;
        }

        if (key == "Control") {
            ctrl = false;
        }

        save_state();
    }

    window.onmousedown = function(evt) {
        if (evt.srcElement != c) {
            return;
        }

        mouse_down = true;
        mouse_start = get_mouse_pos(c, evt);

        try {
            math.compile('click()').eval(parser.scope);
        } catch(e) {

        }

        if (presenting) {
            return false;
        }

        let captured = false;
        for (let i = objs.length-1; i >= 0; i--) {
            let obj = objs[i];
            if (typeof obj.mouse_down === 'function') {
                if (obj.mouse_down(evt)) {
                    captured = true;
                    break;
                }
            }
        }

        if (captured) {
            return false;
        }

        if (frames.mouse_down()) {
            return;
        }

        // didn't touch an obj, if tool is move start a rect
        let obj_selected = false;
        let N = objs.length;
        for (let i = 0; i < N; i++) {
            if (objs[i].is_selected()) {
                obj_selected = true;
            }
        }

        if (tool == "select" && obj_selected == false) {
            selecting = true;
        }
    };

    window.onmousemove = function(evt) {
        // update mouse
        mouse = get_mouse_pos(c, evt);
        mouse_grid = constrain_to_grid(mouse);
        mouse_graph = cam.screen_to_graph(mouse);

        parser.set('x', mouse_graph.x);
        parser.set('y', mouse_graph.y);

        if (mouse_down) {
            let captured = false;
            let N = objs.length;
            for (let i = 0; i < N; i++) {
                let obj = objs[i];
                if (typeof obj.mouse_drag === 'function') {
                    captured = obj.mouse_drag(evt) || captured;
                }
            }
            if (!captured) {
                cam.mouse_drag(evt);
            }
        } else {
            let N = objs.length;
            for (let i = 0; i < N; i++) {
                let obj = objs[i];
                if (typeof obj.mouse_move === 'function') {
                    obj.mouse_move(evt);
                }
            }
        }

        if (presenting) {
            mouse_time = mouse_duration;
        }


        mouse_last = get_mouse_pos(c, evt);
        mouse_grid_last = constrain_to_grid(mouse);
    };

    window.onmouseup = function(evt) {
        if (evt.srcElement != c) {
            return;
        }

        mouse_down = false;

        if (presenting) {
            // maybe tap some text
            let N = objs.length;
            for (let i = 0; i < N; i++) {
                let obj = objs[i];
                if (typeof obj.mouse_up === 'function') {
                    obj.mouse_up(evt);
                }
            }

            return false;
        }

        if (frames.mouse_up(evt)) {
            return;
        }

        if (menu.mouse_up(evt)) {
            new_line = null;
            selecting = false;

            save_state();
            return;
        }

        if (tool == "select") {
            let N = objs.length;
            for (let i = 0; i < N; i++) {
                let obj = objs[i];
                if (typeof obj.mouse_up === 'function') {
                    obj.mouse_up(evt);
                }
            }
        } else if (tool == "text") {
            // add a num obj at mouse pos
            let n = new Text("", mouse_grid);

            let N = objs.length;
            for (let i = 0; i < N; i++) {
                let obj = objs[i];
                if (typeof obj.is_selected == "function") {
                    obj.selected = false;
                }
            }

            n.select();
            objs.push(n);
        } else if (tool == "shape" || tool == "vector") {
            // add a num obj at mouse pos
            if (new_line) {
                // add a point
                new_line.add_point({x: mouse_grid.x, y: mouse_grid.y});
            } else {
                let l = new Shape([0, 0, 0, 1], [{x: mouse_grid.x, y: mouse_grid.y}]);

                if (tool == "vector") {
                    l.properties[frame].v = true;
                } else if (tool == "circle") {
                    l.properties[frame].circle = true;
                }

                objs.push(l);
                new_line = l
            }

            return;
        } else if (tool == "circle") {
            let new_circle = new Circle([0, 0, 0, 1], mouse_grid);
            objs.push(new_circle);
        }

        if (selecting) {
            selecting = false;

            let x = mouse_start.x;
            let y = mouse_start.y;
            let x2 = mouse.x;
            let y2 = mouse.y;

            xx = Math.min(x, x2);
            yy = Math.min(y, y2);
            xx2 = Math.max(x, x2);
            yy2 = Math.max(y, y2);

            let selected_objs = [];

            for (let i = 0; i < objs.length; i++) {
                let obj = objs[i];
                if (typeof obj.in_rect === 'function') {
                    obj.in_rect(xx, yy, xx2, yy2);
                    if (obj.is_selected()) {
                        selected_objs.push(obj);
                    }
                }
            }

            let scopy = copy(selected_objs);
            for (let i = 0; i < scopy.length; i++) {
                let obj = scopy[i];
                let props = copy(obj.properties[frame]);
                obj.properties = {1: props};
            }

            if (scopy.length > 0) {
                // store as text rep
                let string = JSON.stringify(scopy);
                document.getElementById("selected_objects_text").value = string;
            }

            save_state();
            return false;
        }

        save_state();
    }

    save_state();

    var fps = 60;
    animate();
    function animate() {
        setTimeout(function() {
            requestAnimationFrame(animate);
        }, 1000/fps);

        parser.set('t', t);

        if (presenting) {
            mouse_time -= 1;
        }

        ctx.clearRect(0, 0, c.width, c.height);

        cam.update_props();

        draw_grid(ctx);

        ctx.font = font_anim;

        let N = objs.length;
        for (let i = 0; i < N; i++) {
            let obj = objs[i];
            if (obj.command == "e" || obj.new) {
                obj.eval();
            }
        }

        for (let i = 0; i < N; i++) {
            let obj = objs[i];
            obj.render(ctx);
        }

        for (let i = objs.length-1; i >= 0; i--) {
            let obj = objs[i];
            if (obj.deleted) {
                objs.splice(i, 1);
            }
        }

        if (selecting) {
            // draw a rect
            ctx.strokeStyle = dark;
            ctx.strokeRect(mouse_start.x, mouse_start.y, mouse.x - mouse_start.x, mouse.y - mouse_start.y);
        }

        ctx.font = font_menu;

        if (!presenting) {
            frames.render(ctx);
            menu.render(ctx);
        }

        draw_cursor();
        
        transition.update();

        if (playing) {
            transition_with_next(loop_frame(frame + 1));
        }

        t += 1;
    }
}