import shaders from '../shader/Shader';
import ExtrudePainter from '../painter/ExtrudePainter';
import BigDataLayer from './BigDataLayer';
import PathRenderer from './renderer/PathRenderer';
import { vec3 } from '@mapbox/gl-matrix';
import { getTargetZoom } from '../painter/Painter';

const options = {
    'lightPos' : [10, 0, 35],
    'lightColor' : [1, 1, 1],
    'lightIntensity' : 0.5,
    'ambientLight' : [0.02, 0.02, 0.02]
};

export default class ExtrudePolygonLayer extends BigDataLayer {

}

ExtrudePolygonLayer.mergeOptions(options);

ExtrudePolygonLayer.registerJSONType('ExtrudePolygonLayer');

export class ExtrudeRenderer extends PathRenderer {

    onContextCreate() {
        const uniforms = ['u_matrix', 'u_fill_styles[0]', 'u_lightcolor', 'u_lightpos', 'u_ambientlight', 'u_lightintensity'];
        this.program = this.createProgram(shaders.extrude.vertexSource, shaders.extrude.fragmentSource, uniforms);
        super.onContextCreate();
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        // gl.depthFunc(gl.EQUAL);
        // gl.cullFace(gl.FRONT_AND_BACK);
        // If blend is enabled, extrusion's wall will be transparent
        gl.disable(gl.BLEND);
        gl.disable(gl.STENCIL_TEST);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }

    draw() {
        this.prepareCanvas();
        this._drawExtrudes();
        this.completeRender();
    }

    drawOnInteracting() {
        this._drawExtrudes();
        this.completeRender();
    }

    onRemove() {
        delete this._extrudeArrays;
        super.onRemove.apply(this, arguments);
    }

    getTexture(symbol) {
        return this.getFillTexture(symbol);
    }

    _drawExtrudes() {
        const gl = this.gl,
            program = this.program;
        this.useProgram(program);
        this._checkSprites();

        this._prepareData();
        const m = this.calcMatrices();
        gl.uniformMatrix4fv(gl.program['u_matrix'], false, m);
        gl.uniform1fv(program['u_fill_styles'], this._uFillStyle);

        const lightpos = this.layer.options['lightPos'] || [0, 0, 35];
        gl.uniform3fv(gl.program['u_lightpos'], vec3.normalize([], lightpos));

        const lightColor = this.layer.options['lightColor'] || [1, 1, 1];
        gl.uniform3f(gl.program['u_lightcolor'], lightColor[0], lightColor[1], lightColor[2]);

        const ambient = this.layer.options['ambientLight'] || [0.02, 0.02, 0.02];
        gl.uniform3f(gl.program['u_ambientlight'], ambient[0], ambient[1], ambient[2]);

        const lightIntensity = this.layer.options['lightIntensity'] || 0.5;
        gl.uniform1f(gl.program['u_lightintensity'], lightIntensity);
        this._bufferExtrudeData(this._extrudeArrays);
        gl.drawElements(gl.TRIANGLES, this._elementCount, gl.UNSIGNED_INT, 0);
        // gl.drawElements(gl.LINES, this._elementCount, gl.UNSIGNED_INT, 0);
        //release element buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    _prepareData() {
        if (this._extrudeArrays) {
            return;
        }
        const gl = this.gl,
            map = this.getMap();
        const targetZ = getTargetZoom(map);
        const data = this.layer.data;
        const painter = new ExtrudePainter(gl, map);
        for (let i = 0, l = data.length; i < l; i++) {
            if (!data[i]) {
                continue;
            }
            if (Array.isArray(data[i])) {
                const symbol = this.getDataSymbol(data[i][1]);
                const height = data[i][1]['height'];
                const pHeight = map.distanceToPixel(height, 0, targetZ).width;
                painter.addPolygon(data[i][0], pHeight, symbol);
            } else if (data[i].type) {
                //geojson
                const symbol = this.getDataSymbol(data[i].properties);
                const height = data[i].properties['height'];
                const pHeight = map.distanceToPixel(height, 0, targetZ).width;
                painter.addPolygon(data[i], pHeight, symbol);
            }
        }
        const extrudeArrays = this._extrudeArrays = painter.getArrays();
        this._elementCount = extrudeArrays.elementArray.length;
    }

    _bufferExtrudeData(extrudeArrays) {
        const gl = this.gl;
        //buffer vertex data
        if (!this._vertexBuffer) {
            const vertexBuffer = this._vertexBuffer = this.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(extrudeArrays.vertexArray), gl.STATIC_DRAW);
        } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        }
        this.enableVertexAttrib(
            ['a_pos', 3, 'FLOAT']
        );

        //buffer normal data
        if (!this._normalBuffer) {
            const normalBuffer = this._normalBuffer = this.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(extrudeArrays.normalArray), gl.STATIC_DRAW);
        } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._normalBuffer);
        }
        this.enableVertexAttrib(
            ['a_normal', 3, 'FLOAT']
        );

        if (!this._texBuffer) {
            //texture coordinates
            const texBuffer = this._texBuffer = this.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(extrudeArrays.styleArray), gl.STATIC_DRAW);
        } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._texBuffer);
        }
        this.enableVertexAttrib([
            ['a_fill_style', 1, 'FLOAT']
        ]);

        // release binded buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        if (!this._elementBuffer) {
            //buffer element data
            const elementBuffer = this._elementBuffer = this.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(extrudeArrays.elementArray), gl.STATIC_DRAW);
        } else {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._elementBuffer);
        }
    }
}

ExtrudePolygonLayer.registerRenderer('webgl', ExtrudeRenderer);
