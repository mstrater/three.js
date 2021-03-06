/**
 * @author supereggbert / http://www.paulbrunt.co.uk/
 * @author mrdoob / http://mrdoob.com/
 * @author alteredq / http://alteredqualia.com/
 * @author szimek / https://github.com/szimek/
 */

THREE.WebGLRenderer = function ( parameters ) {

	console.log( 'THREE.WebGLRenderer', THREE.REVISION );

	parameters = parameters || {};

	var _canvas = parameters.canvas !== undefined ? parameters.canvas : document.createElement( 'canvas' ),
	_context = parameters.context !== undefined ? parameters.context : null,

	_width = _canvas.width,
	_height = _canvas.height,

	pixelRatio = 1,

	_precision = parameters.precision !== undefined ? parameters.precision : 'highp',

	_alpha = parameters.alpha !== undefined ? parameters.alpha : false,
	_depth = parameters.depth !== undefined ? parameters.depth : true,
	_stencil = parameters.stencil !== undefined ? parameters.stencil : true,
	_antialias = parameters.antialias !== undefined ? parameters.antialias : false,
	_premultipliedAlpha = parameters.premultipliedAlpha !== undefined ? parameters.premultipliedAlpha : true,
	_preserveDrawingBuffer = parameters.preserveDrawingBuffer !== undefined ? parameters.preserveDrawingBuffer : false,
	_logarithmicDepthBuffer = parameters.logarithmicDepthBuffer !== undefined ? parameters.logarithmicDepthBuffer : false,

	_clearColor = new THREE.Color( 0x000000 ),
	_clearAlpha = 0;

	var lights = [];

	var opaqueObjects = [];
	var transparentObjects = [];

	var sprites = [];
	var lensFlares = [];

	// public properties

	this.domElement = _canvas;
	this.context = null;

	// clearing

	this.autoClear = true;
	this.autoClearColor = true;
	this.autoClearDepth = true;
	this.autoClearStencil = true;

	// scene graph

	this.sortObjects = true;

	// physically based shading

	this.gammaFactor = 2.0;	// for backwards compatibility
	this.gammaInput = false;
	this.gammaOutput = false;

	// morphs

	this.maxMorphTargets = 8;
	this.maxMorphNormals = 4;

	// flags

	this.autoScaleCubemaps = true;

	// info

	this.info = {

		memory: {

			programs: 0,
			geometries: 0,
			textures: 0

		},

		render: {

			calls: 0,
			vertices: 0,
			faces: 0,
			points: 0

		}

	};

	// internal properties

	var _this = this,

	_programs = [],

	// internal state cache

	_currentProgram = null,
	_currentFramebuffer = null,
	_currentMaterialId = - 1,
	_currentGeometryProgram = '',
	_currentCamera = null,

	_usedTextureUnits = 0,

	_viewportX = 0,
	_viewportY = 0,
	_viewportWidth = _canvas.width,
	_viewportHeight = _canvas.height,
	_currentWidth = 0,
	_currentHeight = 0,

	// frustum

	_frustum = new THREE.Frustum(),

	 // camera matrices cache

	_projScreenMatrix = new THREE.Matrix4(),

	_vector3 = new THREE.Vector3(),

	// light arrays cache

	_direction = new THREE.Vector3(),

	_lightsNeedUpdate = true,

	_lights = {

		ambient: [ 0, 0, 0 ],
		directional: { length: 0, colors:[], positions: [] },
		point: { length: 0, colors: [], positions: [], distances: [], decays: [] },
		spot: { length: 0, colors: [], positions: [], distances: [], directions: [], anglesCos: [], exponents: [], decays: [] },
		hemi: { length: 0, skyColors: [], groundColors: [], positions: [] }

	};

	// initialize

	var _gl;

	try {

		var attributes = {
			alpha: _alpha,
			depth: _depth,
			stencil: _stencil,
			antialias: _antialias,
			premultipliedAlpha: _premultipliedAlpha,
			preserveDrawingBuffer: _preserveDrawingBuffer
		};

		_gl = _context || _canvas.getContext( 'webgl', attributes ) || _canvas.getContext( 'experimental-webgl', attributes );

		if ( _gl === null ) {

			if ( _canvas.getContext( 'webgl') !== null ) {

				throw 'Error creating WebGL context with your selected attributes.';

			} else {

				throw 'Error creating WebGL context.';

			}

		}

		_canvas.addEventListener( 'webglcontextlost', function ( event ) {

			event.preventDefault();

			resetGLState();
			setDefaultGLState();

			objects.objects = {};

		}, false);

	} catch ( error ) {

		console.error( 'THREE.WebGLRenderer: ' + error );

	}

	var state = new THREE.WebGLState( _gl, paramThreeToGL );

	if ( _gl.getShaderPrecisionFormat === undefined ) {

		_gl.getShaderPrecisionFormat = function () {

			return {
				'rangeMin': 1,
				'rangeMax': 1,
				'precision': 1
			};

		}

	}

	var extensions = new THREE.WebGLExtensions( _gl );
	var objects = new THREE.WebGLObjects( _gl, this.info );

	extensions.get( 'OES_texture_float' );
	extensions.get( 'OES_texture_float_linear' );
	extensions.get( 'OES_texture_half_float' );
	extensions.get( 'OES_texture_half_float_linear' );
	extensions.get( 'OES_standard_derivatives' );
	extensions.get( 'ANGLE_instanced_arrays' );

	if ( extensions.get( 'OES_element_index_uint' ) ) {

		THREE.BufferGeometry.MaxIndex = 4294967296;

	}

	if ( _logarithmicDepthBuffer ) {

		extensions.get( 'EXT_frag_depth' );

	}

	//

	var glClearColor = function ( r, g, b, a ) {

		if ( _premultipliedAlpha === true ) {

			r *= a; g *= a; b *= a;

		}

		_gl.clearColor( r, g, b, a );

	};

	var setDefaultGLState = function () {

		_gl.clearColor( 0, 0, 0, 1 );
		_gl.clearDepth( 1 );
		_gl.clearStencil( 0 );

		_gl.enable( _gl.DEPTH_TEST );
		_gl.depthFunc( _gl.LEQUAL );

		_gl.frontFace( _gl.CCW );
		_gl.cullFace( _gl.BACK );
		_gl.enable( _gl.CULL_FACE );

		_gl.enable( _gl.BLEND );
		_gl.blendEquation( _gl.FUNC_ADD );
		_gl.blendFunc( _gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA );

		_gl.viewport( _viewportX, _viewportY, _viewportWidth, _viewportHeight );

		glClearColor( _clearColor.r, _clearColor.g, _clearColor.b, _clearAlpha );

	};

	var resetGLState = function () {

		_currentProgram = null;
		_currentCamera = null;

		_currentGeometryProgram = '';
		_currentMaterialId = - 1;

		_lightsNeedUpdate = true;

		state.reset();

	};

	setDefaultGLState();

	this.context = _gl;
	this.extensions = extensions;
	this.state = state;

	// shadow map

	var shadowMap = new THREE.WebGLShadowMap( this, lights, objects );

	this.shadowMap = shadowMap;

	// GPU capabilities

	var _maxTextures = _gl.getParameter( _gl.MAX_TEXTURE_IMAGE_UNITS );
	var _maxVertexTextures = _gl.getParameter( _gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS );
	var _maxTextureSize = _gl.getParameter( _gl.MAX_TEXTURE_SIZE );
	var _maxCubemapSize = _gl.getParameter( _gl.MAX_CUBE_MAP_TEXTURE_SIZE );

	var _supportsVertexTextures = _maxVertexTextures > 0;
	var _supportsBoneTextures = _supportsVertexTextures && extensions.get( 'OES_texture_float' );
	var _supportsInstancedArrays = extensions.get( 'ANGLE_instanced_arrays' );

	//

	var _vertexShaderPrecisionHighpFloat = _gl.getShaderPrecisionFormat( _gl.VERTEX_SHADER, _gl.HIGH_FLOAT );
	var _vertexShaderPrecisionMediumpFloat = _gl.getShaderPrecisionFormat( _gl.VERTEX_SHADER, _gl.MEDIUM_FLOAT );

	var _fragmentShaderPrecisionHighpFloat = _gl.getShaderPrecisionFormat( _gl.FRAGMENT_SHADER, _gl.HIGH_FLOAT );
	var _fragmentShaderPrecisionMediumpFloat = _gl.getShaderPrecisionFormat( _gl.FRAGMENT_SHADER, _gl.MEDIUM_FLOAT );

	var getCompressedTextureFormats = ( function () {

		var array;

		return function () {

			if ( array !== undefined ) {

				return array;

			}

			array = [];

			if ( extensions.get( 'WEBGL_compressed_texture_pvrtc' ) || extensions.get( 'WEBGL_compressed_texture_s3tc' ) ) {

				var formats = _gl.getParameter( _gl.COMPRESSED_TEXTURE_FORMATS );

				for ( var i = 0; i < formats.length; i ++ ) {

					array.push( formats[ i ] );

				}

			}

			return array;

		};

	} )();

	// clamp precision to maximum available

	var highpAvailable = _vertexShaderPrecisionHighpFloat.precision > 0 && _fragmentShaderPrecisionHighpFloat.precision > 0;
	var mediumpAvailable = _vertexShaderPrecisionMediumpFloat.precision > 0 && _fragmentShaderPrecisionMediumpFloat.precision > 0;

	if ( _precision === 'highp' && ! highpAvailable ) {

		if ( mediumpAvailable ) {

			_precision = 'mediump';
			console.warn( 'THREE.WebGLRenderer: highp not supported, using mediump.' );

		} else {

			_precision = 'lowp';
			console.warn( 'THREE.WebGLRenderer: highp and mediump not supported, using lowp.' );

		}

	}

	if ( _precision === 'mediump' && ! mediumpAvailable ) {

		_precision = 'lowp';
		console.warn( 'THREE.WebGLRenderer: mediump not supported, using lowp.' );

	}

	// Plugins

	var spritePlugin = new THREE.SpritePlugin( this, sprites );
	var lensFlarePlugin = new THREE.LensFlarePlugin( this, lensFlares );

	// API

	this.getContext = function () {

		return _gl;

	};

	this.forceContextLoss = function () {

		extensions.get( 'WEBGL_lose_context' ).loseContext();

	};

	this.supportsVertexTextures = function () {

		return _supportsVertexTextures;

	};

	this.supportsInstancedArrays = function () {

		return _supportsInstancedArrays;

	};

	this.supportsFloatTextures = function () {

		return extensions.get( 'OES_texture_float' );

	};

	this.supportsHalfFloatTextures = function () {

		return extensions.get( 'OES_texture_half_float' );

	};

	this.supportsStandardDerivatives = function () {

		return extensions.get( 'OES_standard_derivatives' );

	};

	this.supportsCompressedTextureS3TC = function () {

		return extensions.get( 'WEBGL_compressed_texture_s3tc' );

	};

	this.supportsCompressedTexturePVRTC = function () {

		return extensions.get( 'WEBGL_compressed_texture_pvrtc' );

	};

	this.supportsBlendMinMax = function () {

		return extensions.get( 'EXT_blend_minmax' );

	};

	this.getMaxAnisotropy = ( function () {

		var value;

		return function () {

			if ( value !== undefined ) {

				return value;

			}

			var extension = extensions.get( 'EXT_texture_filter_anisotropic' );

			value = extension !== null ? _gl.getParameter( extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT ) : 0;

			return value;

		}

	} )();

	this.getPrecision = function () {

		return _precision;

	};

	this.getPixelRatio = function () {

		return pixelRatio;

	};

	this.setPixelRatio = function ( value ) {

		pixelRatio = value;

	};

	this.getSize = function () {

		return {
			width: _width,
			height: _height
		};

	};

	this.setSize = function ( width, height, updateStyle ) {

		_width = width;
		_height = height;

		_canvas.width = width * pixelRatio;
		_canvas.height = height * pixelRatio;

		if ( updateStyle !== false ) {

			_canvas.style.width = width + 'px';
			_canvas.style.height = height + 'px';

		}

		this.setViewport( 0, 0, width, height );

	};

	this.setViewport = function ( x, y, width, height ) {

		_viewportX = x * pixelRatio;
		_viewportY = y * pixelRatio;

		_viewportWidth = width * pixelRatio;
		_viewportHeight = height * pixelRatio;

		_gl.viewport( _viewportX, _viewportY, _viewportWidth, _viewportHeight );

	};

	this.setScissor = function ( x, y, width, height ) {

		_gl.scissor(
			x * pixelRatio,
			y * pixelRatio,
			width * pixelRatio,
			height * pixelRatio
		);

	};

	this.enableScissorTest = function ( enable ) {

		enable ? _gl.enable( _gl.SCISSOR_TEST ) : _gl.disable( _gl.SCISSOR_TEST );

	};

	// Clearing

	this.getClearColor = function () {

		return _clearColor;

	};

	this.setClearColor = function ( color, alpha ) {

		_clearColor.set( color );

		_clearAlpha = alpha !== undefined ? alpha : 1;

		glClearColor( _clearColor.r, _clearColor.g, _clearColor.b, _clearAlpha );

	};

	this.getClearAlpha = function () {

		return _clearAlpha;

	};

	this.setClearAlpha = function ( alpha ) {

		_clearAlpha = alpha;

		glClearColor( _clearColor.r, _clearColor.g, _clearColor.b, _clearAlpha );

	};

	this.clear = function ( color, depth, stencil ) {

		var bits = 0;

		if ( color === undefined || color ) bits |= _gl.COLOR_BUFFER_BIT;
		if ( depth === undefined || depth ) bits |= _gl.DEPTH_BUFFER_BIT;
		if ( stencil === undefined || stencil ) bits |= _gl.STENCIL_BUFFER_BIT;

		_gl.clear( bits );

	};

	this.clearColor = function () {

		_gl.clear( _gl.COLOR_BUFFER_BIT );

	};

	this.clearDepth = function () {

		_gl.clear( _gl.DEPTH_BUFFER_BIT );

	};

	this.clearStencil = function () {

		_gl.clear( _gl.STENCIL_BUFFER_BIT );

	};

	this.clearTarget = function ( renderTarget, color, depth, stencil ) {

		this.setRenderTarget( renderTarget );
		this.clear( color, depth, stencil );

	};

	// Reset

	this.resetGLState = resetGLState;

	// Events

	var onTextureDispose = function ( event ) {

		var texture = event.target;

		texture.removeEventListener( 'dispose', onTextureDispose );

		deallocateTexture( texture );

		_this.info.memory.textures --;


	};

	var onRenderTargetDispose = function ( event ) {

		var renderTarget = event.target;

		renderTarget.removeEventListener( 'dispose', onRenderTargetDispose );

		deallocateRenderTarget( renderTarget );

		_this.info.memory.textures --;

	};

	var onMaterialDispose = function ( event ) {

		var material = event.target;

		material.removeEventListener( 'dispose', onMaterialDispose );

		deallocateMaterial( material );

	};

	// Buffer deallocation

	var deallocateTexture = function ( texture ) {

		if ( texture.image && texture.image.__webglTextureCube ) {

			// cube texture

			_gl.deleteTexture( texture.image.__webglTextureCube );

			delete texture.image.__webglTextureCube;

		} else {

			// 2D texture

			if ( texture.__webglInit === undefined ) return;

			_gl.deleteTexture( texture.__webglTexture );

			delete texture.__webglTexture;
			delete texture.__webglInit;

		}

	};

	var deallocateRenderTarget = function ( renderTarget ) {

		if ( ! renderTarget || renderTarget.__webglTexture === undefined ) return;

		_gl.deleteTexture( renderTarget.__webglTexture );

		delete renderTarget.__webglTexture;

		if ( renderTarget instanceof THREE.WebGLRenderTargetCube ) {

			for ( var i = 0; i < 6; i ++ ) {

				_gl.deleteFramebuffer( renderTarget.__webglFramebuffer[ i ] );
				_gl.deleteRenderbuffer( renderTarget.__webglRenderbuffer[ i ] );

			}

		} else {

			_gl.deleteFramebuffer( renderTarget.__webglFramebuffer );
			_gl.deleteRenderbuffer( renderTarget.__webglRenderbuffer );

		}

		delete renderTarget.__webglFramebuffer;
		delete renderTarget.__webglRenderbuffer;

	};

	var deallocateMaterial = function ( material ) {

		var program = material.program.program;

		if ( program === undefined ) return;

		material.program = undefined;

		// only deallocate GL program if this was the last use of shared program
		// assumed there is only single copy of any program in the _programs list
		// (that's how it's constructed)

		var i, il, programInfo;
		var deleteProgram = false;

		for ( i = 0, il = _programs.length; i < il; i ++ ) {

			programInfo = _programs[ i ];

			if ( programInfo.program === program ) {

				programInfo.usedTimes --;

				if ( programInfo.usedTimes === 0 ) {

					deleteProgram = true;

				}

				break;

			}

		}

		if ( deleteProgram === true ) {

			// avoid using array.splice, this is costlier than creating new array from scratch

			var newPrograms = [];

			for ( i = 0, il = _programs.length; i < il; i ++ ) {

				programInfo = _programs[ i ];

				if ( programInfo.program !== program ) {

					newPrograms.push( programInfo );

				}

			}

			_programs = newPrograms;

			_gl.deleteProgram( program );

			_this.info.memory.programs --;

		}

	};

	// Buffer rendering

	this.renderBufferImmediate = function ( object, program, material ) {

		state.initAttributes();

		if ( object.hasPositions && ! object.__webglVertexBuffer ) object.__webglVertexBuffer = _gl.createBuffer();
		if ( object.hasNormals && ! object.__webglNormalBuffer ) object.__webglNormalBuffer = _gl.createBuffer();
		if ( object.hasUvs && ! object.__webglUvBuffer ) object.__webglUvBuffer = _gl.createBuffer();
		if ( object.hasColors && ! object.__webglColorBuffer ) object.__webglColorBuffer = _gl.createBuffer();

		if ( object.hasPositions ) {

			_gl.bindBuffer( _gl.ARRAY_BUFFER, object.__webglVertexBuffer );
			_gl.bufferData( _gl.ARRAY_BUFFER, object.positionArray, _gl.DYNAMIC_DRAW );

			state.enableAttribute( program.attributes.position );

			_gl.vertexAttribPointer( program.attributes.position, 3, _gl.FLOAT, false, 0, 0 );

		}

		if ( object.hasNormals ) {

			_gl.bindBuffer( _gl.ARRAY_BUFFER, object.__webglNormalBuffer );

			if ( material instanceof THREE.MeshPhongMaterial === false && material.shading === THREE.FlatShading ) {

				var nx, ny, nz,
					nax, nbx, ncx, nay, nby, ncy, naz, nbz, ncz,
					normalArray,
					i, il = object.count * 3;

				for ( i = 0; i < il; i += 9 ) {

					normalArray = object.normalArray;

					nax = normalArray[ i ];
					nay = normalArray[ i + 1 ];
					naz = normalArray[ i + 2 ];

					nbx = normalArray[ i + 3 ];
					nby = normalArray[ i + 4 ];
					nbz = normalArray[ i + 5 ];

					ncx = normalArray[ i + 6 ];
					ncy = normalArray[ i + 7 ];
					ncz = normalArray[ i + 8 ];

					nx = ( nax + nbx + ncx ) / 3;
					ny = ( nay + nby + ncy ) / 3;
					nz = ( naz + nbz + ncz ) / 3;

					normalArray[ i     ] = nx;
					normalArray[ i + 1 ] = ny;
					normalArray[ i + 2 ] = nz;

					normalArray[ i + 3 ] = nx;
					normalArray[ i + 4 ] = ny;
					normalArray[ i + 5 ] = nz;

					normalArray[ i + 6 ] = nx;
					normalArray[ i + 7 ] = ny;
					normalArray[ i + 8 ] = nz;

				}

			}

			_gl.bufferData( _gl.ARRAY_BUFFER, object.normalArray, _gl.DYNAMIC_DRAW );

			state.enableAttribute( program.attributes.normal );

			_gl.vertexAttribPointer( program.attributes.normal, 3, _gl.FLOAT, false, 0, 0 );

		}

		if ( object.hasUvs && material.map ) {

			_gl.bindBuffer( _gl.ARRAY_BUFFER, object.__webglUvBuffer );
			_gl.bufferData( _gl.ARRAY_BUFFER, object.uvArray, _gl.DYNAMIC_DRAW );

			state.enableAttribute( program.attributes.uv );

			_gl.vertexAttribPointer( program.attributes.uv, 2, _gl.FLOAT, false, 0, 0 );

		}

		if ( object.hasColors && material.vertexColors !== THREE.NoColors ) {

			_gl.bindBuffer( _gl.ARRAY_BUFFER, object.__webglColorBuffer );
			_gl.bufferData( _gl.ARRAY_BUFFER, object.colorArray, _gl.DYNAMIC_DRAW );

			state.enableAttribute( program.attributes.color );

			_gl.vertexAttribPointer( program.attributes.color, 3, _gl.FLOAT, false, 0, 0 );

		}

		state.disableUnusedAttributes();

		_gl.drawArrays( _gl.TRIANGLES, 0, object.count );

		object.count = 0;

	};

	function setupVertexAttributes( material, program, geometry, startIndex ) {

		var extension;

		if ( geometry instanceof THREE.InstancedBufferGeometry ) {

			extension = extensions.get( 'ANGLE_instanced_arrays' );

			if ( extension === null ) {

				console.error( 'THREE.WebGLRenderer.setupVertexAttributes: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.' );
				return;

			}

		}

		var geometryAttributes = geometry.attributes;

		var programAttributes = program.attributes;
		var programAttributesKeys = program.attributesKeys;

		for ( var i = 0, l = programAttributesKeys.length; i < l; i ++ ) {

			var key = programAttributesKeys[ i ];
			var programAttribute = programAttributes[ key ];

			if ( programAttribute >= 0 ) {

				var geometryAttribute = geometryAttributes[ key ];

				if ( geometryAttribute !== undefined ) {

					var size = geometryAttribute.itemSize;
					state.enableAttribute( programAttribute );

					if ( geometryAttribute instanceof THREE.InterleavedBufferAttribute ) {

						var data = geometryAttribute.data;
						var stride = data.stride;
						var offset = geometryAttribute.offset;

						_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryAttribute.data.buffer );
						_gl.vertexAttribPointer( programAttribute, size, _gl.FLOAT, false, stride * data.array.BYTES_PER_ELEMENT, ( startIndex * stride + offset ) * data.array.BYTES_PER_ELEMENT );

						if ( data instanceof THREE.InstancedInterleavedBuffer ) {

							if ( extension === null ) {

								console.error( 'THREE.WebGLRenderer.setupVertexAttributes: using THREE.InstancedBufferAttribute but hardware does not support extension ANGLE_instanced_arrays.' );
								return;

							}

							extension.vertexAttribDivisorANGLE( programAttribute, data.meshPerAttribute );

							if ( geometry.maxInstancedCount === undefined ) {

								geometry.maxInstancedCount = data.meshPerAttribute * ( data.array.length / data.stride );

							}

						}

					} else {

						_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryAttribute.buffer );
						_gl.vertexAttribPointer( programAttribute, size, _gl.FLOAT, false, 0, startIndex * size * 4 ); // 4 bytes per Float32

						if ( geometryAttribute instanceof THREE.InstancedBufferAttribute ) {

							if ( extension === null ) {

								console.error( 'THREE.WebGLRenderer.setupVertexAttributes: using THREE.InstancedBufferAttribute but hardware does not support extension ANGLE_instanced_arrays.' );
								return;

							}

							extension.vertexAttribDivisorANGLE( programAttribute, geometryAttribute.meshPerAttribute );

							if ( geometry.maxInstancedCount === undefined ) {

								geometry.maxInstancedCount = geometryAttribute.meshPerAttribute * ( geometryAttribute.array.length / geometryAttribute.itemSize );

							}

						}

					}

				} else if ( material.defaultAttributeValues !== undefined ) {

					if ( material.defaultAttributeValues[ key ] !== undefined ) {

						if ( material.defaultAttributeValues[ key ].length === 2 ) {

							_gl.vertexAttrib2fv( programAttribute, material.defaultAttributeValues[ key ] );

						} else if ( material.defaultAttributeValues[ key ].length === 3 ) {

							_gl.vertexAttrib3fv( programAttribute, material.defaultAttributeValues[ key ] );

						}

					}

				}

			}

		}

		state.disableUnusedAttributes();

	}

	this.renderBufferDirect = function ( camera, lights, fog, material, object ) {

		if ( material.visible === false ) return;

		var geometry = objects.geometries.get( object );
		var program = setProgram( camera, lights, fog, material, object );

		var updateBuffers = false,
			wireframeBit = material.wireframe ? 1 : 0,
			geometryProgram = geometry.id + '_' + program.id + '_' + wireframeBit;

		if ( geometryProgram !== _currentGeometryProgram ) {

			_currentGeometryProgram = geometryProgram;
			updateBuffers = true;

		}

		if ( updateBuffers ) {

			state.initAttributes();

		}

		if ( object instanceof THREE.Mesh ) {

			renderMesh( material, geometry, object, program, updateBuffers );

		} else if ( object instanceof THREE.Line ) {

			renderLine( material, geometry, object, program, updateBuffers );

		} else if ( object instanceof THREE.PointCloud ) {

			renderPointCloud( material, geometry, object, program, updateBuffers );

		}

	};

	function renderMesh( material, geometry, object, program, updateBuffers ) {

		var mode = material.wireframe === true ? _gl.LINES : _gl.TRIANGLES;

		var index = geometry.attributes.index;

		if ( index ) {

			// indexed triangles

			var type, size;

			if ( index.array instanceof Uint32Array && extensions.get( 'OES_element_index_uint' ) ) {

				type = _gl.UNSIGNED_INT;
				size = 4;

			} else {

				type = _gl.UNSIGNED_SHORT;
				size = 2;

			}

			var offsets = geometry.offsets;

			if ( offsets.length === 0 ) {

				if ( updateBuffers ) {

					setupVertexAttributes( material, program, geometry, 0 );
					_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, index.buffer );

				}

				if ( geometry instanceof THREE.InstancedBufferGeometry && geometry.maxInstancedCount > 0 ) {

					var extension = extensions.get( 'ANGLE_instanced_arrays' );

					if ( extension === null ) {

						console.error( 'THREE.WebGLRenderer.renderMesh: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.' );
						return;

					}

					extension.drawElementsInstancedANGLE( mode, index.array.length, type, 0, geometry.maxInstancedCount ); // Draw the instanced meshes

				} else {

					_gl.drawElements( mode, index.array.length, type, 0 );

				}
				_this.info.render.calls ++;
				_this.info.render.vertices += index.array.length; // not really true, here vertices can be shared
				_this.info.render.faces += index.array.length / 3;

			} else {

				// if there is more than 1 chunk
				// must set attribute pointers to use new offsets for each chunk
				// even if geometry and materials didn't change

				updateBuffers = true;

				for ( var i = 0, il = offsets.length; i < il; i ++ ) {

					var startIndex = offsets[ i ].index;

					if ( updateBuffers ) {

						setupVertexAttributes( material, program, geometry, startIndex );
						_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, index.buffer );

					}

					// render indexed triangles

					if ( geometry instanceof THREE.InstancedBufferGeometry && offsets[i].instances > 0 ) {

						var extension = extensions.get( 'ANGLE_instanced_arrays' );

						if ( extension === null ) {

							console.error( 'THREE.WebGLRenderer.renderMesh: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.' );
							return;

						}

						extension.drawElementsInstancedANGLE( mode, offsets[i].count, type, offsets[i].start * size, offsets[i].count, type, offsets[i].instances ); // Draw the instanced meshes

					} else {

						_gl.drawElements( mode, offsets[ i ].count, type, offsets[ i ].start * size );

					}

					_this.info.render.calls ++;
					_this.info.render.vertices += offsets[ i ].count; // not really true, here vertices can be shared
					_this.info.render.faces += offsets[ i ].count / 3;

				}

			}

		} else {

			// non-indexed triangles

			var offsets = geometry.offsets;

			if ( offsets.length === 0 ) {

				if ( updateBuffers ) {

					setupVertexAttributes( material, program, geometry, 0 );

				}

				var position = geometry.attributes.position;

				// render non-indexed triangles

				if ( geometry instanceof THREE.InstancedBufferGeometry && geometry.maxInstancedCount > 0 ) {

					var extension = extensions.get( 'ANGLE_instanced_arrays' );

					if ( extension === null ) {

						console.error( 'THREE.WebGLRenderer.renderMesh: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.' );
						return;

					}

					if ( position instanceof THREE.InterleavedBufferAttribute ) {

						extension.drawArraysInstancedANGLE( mode, 0, position.data.array.length / position.data.stride, geometry.maxInstancedCount ); // Draw the instanced meshes

					} else {

						extension.drawArraysInstancedANGLE( mode, 0, position.array.length / position.itemSize, geometry.maxInstancedCount ); // Draw the instanced meshes

					}

				} else {

					if ( position instanceof THREE.InterleavedBufferAttribute ) {

						_gl.drawArrays( mode, 0, position.data.array.length / position.data.stride );

					} else {

						_gl.drawArrays( mode, 0, position.array.length / position.itemSize );

					}

				}

				_this.info.render.calls++;
				_this.info.render.vertices += position.array.length / position.itemSize;
				_this.info.render.faces += position.array.length / ( 3 * position.itemSize );

			} else {

				// if there is more than 1 chunk
				// must set attribute pointers to use new offsets for each chunk
				// even if geometry and materials didn't change

				if ( updateBuffers ) {

					setupVertexAttributes( material, program, geometry, 0 );

				}

				for ( var i = 0, il = offsets.length; i < il; i++ ) {

					// render non-indexed triangles

					if ( geometry instanceof THREE.InstancedBufferGeometry ) {

						console.error( 'THREE.WebGLRenderer.renderMesh: cannot use drawCalls with THREE.InstancedBufferGeometry.' );
						return;

					} else {

						_gl.drawArrays( mode, offsets[ i ].start, offsets[ i ].count );

					}

					_this.info.render.calls++;
					_this.info.render.vertices += offsets[ i ].count;
					_this.info.render.faces += ( offsets[ i ].count  ) / 3;

				}
			}
		}

	}

	function renderLine( material, geometry, object, program, updateBuffers ) {

		var mode = object instanceof THREE.LineSegments ? _gl.LINES : _gl.LINE_STRIP;

		// In case user is not using Line*Material by mistake
		var lineWidth = material.linewidth !== undefined ? material.linewidth : 1;

		state.setLineWidth( lineWidth * pixelRatio );

		var index = geometry.attributes.index;

		if ( index ) {

			// indexed lines

			var type, size;

			if ( index.array instanceof Uint32Array ) {

				type = _gl.UNSIGNED_INT;
				size = 4;

			} else {

				type = _gl.UNSIGNED_SHORT;
				size = 2;

			}

			var offsets = geometry.offsets;

			if ( offsets.length === 0 ) {

				if ( updateBuffers ) {

					setupVertexAttributes( material, program, geometry, 0 );
					_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, index.buffer );

				}

				_gl.drawElements( mode, index.array.length, type, 0 ); // 2 bytes per Uint16Array

				_this.info.render.calls ++;
				_this.info.render.vertices += index.array.length; // not really true, here vertices can be shared

			} else {

				// if there is more than 1 chunk
				// must set attribute pointers to use new offsets for each chunk
				// even if geometry and materials didn't change

				if ( offsets.length > 1 ) updateBuffers = true;

				for ( var i = 0, il = offsets.length; i < il; i ++ ) {

					var startIndex = offsets[ i ].index;

					if ( updateBuffers ) {

						setupVertexAttributes( material, program, geometry, startIndex );
						_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, index.buffer );

					}

					// render indexed lines

					_gl.drawElements( mode, offsets[ i ].count, type, offsets[ i ].start * size ); // 2 bytes per Uint16Array

					_this.info.render.calls ++;
					_this.info.render.vertices += offsets[ i ].count; // not really true, here vertices can be shared

				}

			}

		} else {

			// non-indexed lines

			if ( updateBuffers ) {

				setupVertexAttributes( material, program, geometry, 0 );

			}

			var position = geometry.attributes.position;
			var offsets = geometry.offsets;

			if ( offsets.length === 0 ) {

				_gl.drawArrays( mode, 0, position.array.length / 3 );

				_this.info.render.calls ++;
				_this.info.render.vertices += position.array.length / 3;

			} else {

				for ( var i = 0, il = offsets.length; i < il; i ++ ) {

					_gl.drawArrays( mode, offsets[ i ].index, offsets[ i ].count );

					_this.info.render.calls ++;
					_this.info.render.vertices += offsets[ i ].count;

				}

			}

		}

	}

	function renderPointCloud( material, geometry, object, program, updateBuffers ) {

		var mode = _gl.POINTS;

		var index = geometry.attributes.index;

		if ( index ) {

			// indexed points

			var type, size;

			if ( index.array instanceof Uint32Array && extensions.get( 'OES_element_index_uint' ) ) {

				type = _gl.UNSIGNED_INT;
				size = 4;

			} else {

				type = _gl.UNSIGNED_SHORT;
				size = 2;

			}

			var offsets = geometry.offsets;

			if ( offsets.length === 0 ) {

				if ( updateBuffers ) {

					setupVertexAttributes( material, program, geometry, 0 );
					_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, index.buffer );

				}

				_gl.drawElements( mode, index.array.length, type, 0);

				_this.info.render.calls ++;
				_this.info.render.points += index.array.length;

			} else {

				// if there is more than 1 chunk
				// must set attribute pointers to use new offsets for each chunk
				// even if geometry and materials didn't change

				if ( offsets.length > 1 ) updateBuffers = true;

				for ( var i = 0, il = offsets.length; i < il; i ++ ) {

					var startIndex = offsets[ i ].index;

					if ( updateBuffers ) {

						setupVertexAttributes( material, program, geometry, startIndex );
						_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, index.buffer );

					}

					// render indexed points

					_gl.drawElements( mode, offsets[ i ].count, type, offsets[ i ].start * size );

					_this.info.render.calls ++;
					_this.info.render.points += offsets[ i ].count;

				}

			}

		} else {

			// non-indexed points

			if ( updateBuffers ) {

				setupVertexAttributes( material, program, geometry, 0 );

			}

			var position = geometry.attributes.position;
			var offsets = geometry.offsets;

			if ( offsets.length === 0 ) {

				_gl.drawArrays( mode, 0, position.array.length / 3 );

				_this.info.render.calls ++;
				_this.info.render.points += position.array.length / 3;

			} else {

				for ( var i = 0, il = offsets.length; i < il; i ++ ) {

					_gl.drawArrays( mode, offsets[ i ].index, offsets[ i ].count );

					_this.info.render.calls ++;
					_this.info.render.points += offsets[ i ].count;

				}

			}

		}

	}

	function setupMorphTargets( material, geometryGroup, object ) {

		// set base

		var attributes = material.program.attributes;

		if ( object.morphTargetBase !== - 1 && attributes.position >= 0 ) {

			_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryGroup.__webglMorphTargetsBuffers[ object.morphTargetBase ] );

			state.enableAttribute( attributes.position );

			_gl.vertexAttribPointer( attributes.position, 3, _gl.FLOAT, false, 0, 0 );

		} else if ( attributes.position >= 0 ) {

			_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryGroup.__webglVertexBuffer );

			state.enableAttribute( attributes.position );

			_gl.vertexAttribPointer( attributes.position, 3, _gl.FLOAT, false, 0, 0 );

		}

		if ( object.morphTargetForcedOrder.length ) {

			// set forced order

			var m = 0;
			var order = object.morphTargetForcedOrder;
			var influences = object.morphTargetInfluences;

			var attribute;

			while ( m < material.numSupportedMorphTargets && m < order.length ) {

				attribute = attributes[ 'morphTarget' + m ];

				if ( attribute >= 0 ) {

					_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryGroup.__webglMorphTargetsBuffers[ order[ m ] ] );

					state.enableAttribute( attribute );

					_gl.vertexAttribPointer( attribute, 3, _gl.FLOAT, false, 0, 0 );

				}

				attribute = attributes[ 'morphNormal' + m ];

				if ( attribute >= 0 && material.morphNormals ) {

					_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryGroup.__webglMorphNormalsBuffers[ order[ m ] ] );

					state.enableAttribute( attribute );

					_gl.vertexAttribPointer( attribute, 3, _gl.FLOAT, false, 0, 0 );

				}

				object.__webglMorphTargetInfluences[ m ] = influences[ order[ m ] ];

				m ++;

			}

		} else {

			// find the most influencing

			var activeInfluenceIndices = [];
			var influences = object.morphTargetInfluences;
			var morphTargets = object.geometry.morphTargets;

			if ( influences.length > morphTargets.length ) {

				console.warn( 'THREE.WebGLRenderer: Influences array is bigger than morphTargets array.' );
				influences.length = morphTargets.length;

			}

			for ( var i = 0, il = influences.length; i < il; i ++ ) {

				var influence = influences[ i ];

				activeInfluenceIndices.push( [ influence, i ] );

			}

			if ( activeInfluenceIndices.length > material.numSupportedMorphTargets ) {

				activeInfluenceIndices.sort( numericalSort );
				activeInfluenceIndices.length = material.numSupportedMorphTargets;

			} else if ( activeInfluenceIndices.length > material.numSupportedMorphNormals ) {

				activeInfluenceIndices.sort( numericalSort );

			} else if ( activeInfluenceIndices.length === 0 ) {

				activeInfluenceIndices.push( [ 0, 0 ] );

			}

			var attribute;

			for ( var m = 0, ml = material.numSupportedMorphTargets; m < ml; m ++ ) {

				if ( activeInfluenceIndices[ m ] ) {

					var influenceIndex = activeInfluenceIndices[ m ][ 1 ];

					attribute = attributes[ 'morphTarget' + m ];

					if ( attribute >= 0 ) {

						_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryGroup.__webglMorphTargetsBuffers[ influenceIndex ] );

						state.enableAttribute( attribute );

						_gl.vertexAttribPointer( attribute, 3, _gl.FLOAT, false, 0, 0 );

					}

					attribute = attributes[ 'morphNormal' + m ];

					if ( attribute >= 0 && material.morphNormals ) {

						_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryGroup.__webglMorphNormalsBuffers[ influenceIndex ] );

						state.enableAttribute( attribute );

						_gl.vertexAttribPointer( attribute, 3, _gl.FLOAT, false, 0, 0 );

					}

					object.__webglMorphTargetInfluences[ m ] = influences[ influenceIndex ];

				} else {

					/*
					_gl.vertexAttribPointer( attributes[ "morphTarget" + m ], 3, _gl.FLOAT, false, 0, 0 );

					if ( material.morphNormals ) {

						_gl.vertexAttribPointer( attributes[ "morphNormal" + m ], 3, _gl.FLOAT, false, 0, 0 );

					}
					*/

					object.__webglMorphTargetInfluences[ m ] = 0;

				}

			}

		}

		// load updated influences uniform

		if ( material.program.uniforms.morphTargetInfluences !== null ) {

			_gl.uniform1fv( material.program.uniforms.morphTargetInfluences, object.__webglMorphTargetInfluences );

		}

	}

	// Sorting

	function painterSortStable ( a, b ) {

		if ( a.object.renderOrder !== b.object.renderOrder ) {

			return a.object.renderOrder - b.object.renderOrder;

		} else if ( a.object.material.id !== b.object.material.id ) {

			return a.object.material.id - b.object.material.id;

		} else if ( a.z !== b.z ) {

			return a.z - b.z;

		} else {

			return a.id - b.id;

		}

	}

	function reversePainterSortStable ( a, b ) {

		if ( a.object.renderOrder !== b.object.renderOrder ) {

			return a.object.renderOrder - b.object.renderOrder;

		} if ( a.z !== b.z ) {

			return b.z - a.z;

		} else {

			return a.id - b.id;

		}

	}

	function numericalSort ( a, b ) {

		return b[ 0 ] - a[ 0 ];

	}

	// Rendering

	this.render = function ( scene, camera, renderTarget, forceClear ) {

		if ( camera instanceof THREE.Camera === false ) {

			console.error( 'THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.' );
			return;

		}

		var fog = scene.fog;

		// reset caching for this frame

		_currentGeometryProgram = '';
		_currentMaterialId = - 1;
		_currentCamera = null;
		_lightsNeedUpdate = true;

		// update scene graph

		if ( scene.autoUpdate === true ) scene.updateMatrixWorld();

		// update camera matrices and frustum

		if ( camera.parent === undefined ) camera.updateMatrixWorld();

		camera.matrixWorldInverse.getInverse( camera.matrixWorld );

		_projScreenMatrix.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		_frustum.setFromMatrix( _projScreenMatrix );

		lights.length = 0;
		opaqueObjects.length = 0;
		transparentObjects.length = 0;

		sprites.length = 0;
		lensFlares.length = 0;

		projectObject( scene );

		if ( _this.sortObjects === true ) {

			opaqueObjects.sort( painterSortStable );
			transparentObjects.sort( reversePainterSortStable );

		}

		objects.update( opaqueObjects );
		objects.update( transparentObjects );

		//

		shadowMap.render( scene, camera );

		//

		_this.info.render.calls = 0;
		_this.info.render.vertices = 0;
		_this.info.render.faces = 0;
		_this.info.render.points = 0;

		this.setRenderTarget( renderTarget );

		if ( this.autoClear || forceClear ) {

			this.clear( this.autoClearColor, this.autoClearDepth, this.autoClearStencil );

		}

		// set matrices for immediate objects

		for ( var i = 0, il = objects.objectsImmediate.length; i < il; i ++ ) {

			var webglObject = objects.objectsImmediate[ i ];
			var object = webglObject.object;

			if ( object.visible ) {

				setupMatrices( object, camera );

				var material = object.material;

				if ( material.transparent ) {

					webglObject.transparent = material;
					webglObject.opaque = null;

				} else {

					webglObject.opaque = material;
					webglObject.transparent = null;

				}

			}

		}

		if ( scene.overrideMaterial ) {

			var overrideMaterial = scene.overrideMaterial;

			setMaterial( overrideMaterial );

			renderObjects( opaqueObjects, camera, lights, fog, overrideMaterial );
			renderObjects( transparentObjects, camera, lights, fog, overrideMaterial );
			renderObjectsImmediate( objects.objectsImmediate, '', camera, lights, fog, overrideMaterial );

		} else {

			// opaque pass (front-to-back order)

			state.setBlending( THREE.NoBlending );

			renderObjects( opaqueObjects, camera, lights, fog, null );
			renderObjectsImmediate( objects.objectsImmediate, 'opaque', camera, lights, fog, null );

			// transparent pass (back-to-front order)

			renderObjects( transparentObjects, camera, lights, fog, null );
			renderObjectsImmediate( objects.objectsImmediate, 'transparent', camera, lights, fog, null );

		}

		// custom render plugins (post pass)

		spritePlugin.render( scene, camera );
		lensFlarePlugin.render( scene, camera, _currentWidth, _currentHeight );

		// Generate mipmap if we're using any kind of mipmap filtering

		if ( renderTarget && renderTarget.generateMipmaps && renderTarget.minFilter !== THREE.NearestFilter && renderTarget.minFilter !== THREE.LinearFilter ) {

			updateRenderTargetMipmap( renderTarget );

		}

		// Ensure depth buffer writing is enabled so it can be cleared on next render

		state.setDepthTest( true );
		state.setDepthWrite( true );
		state.setColorWrite( true );

		// _gl.finish();

	};

	function projectObject( object ) {

		if ( object.visible === false ) return;

		if ( object instanceof THREE.Scene || object instanceof THREE.Group ) {

			// skip

		} else {

			// update Skeleton objects
			if ( object instanceof THREE.SkinnedMesh ) {

				object.skeleton.update();

			}

			objects.init( object );

			if ( object instanceof THREE.Light ) {

				lights.push( object );

			} else if ( object instanceof THREE.Sprite ) {

				sprites.push( object );

			} else if ( object instanceof THREE.LensFlare ) {

				lensFlares.push( object );

			} else {

				var webglObject = objects.objects[ object.id ];

				if ( webglObject && ( object.frustumCulled === false || _frustum.intersectsObject( object ) === true ) ) {

					var material = object.material;

					if ( material.transparent ) {

						transparentObjects.push( webglObject );

					} else {

						opaqueObjects.push( webglObject );

					}

					if ( _this.sortObjects === true ) {

						_vector3.setFromMatrixPosition( object.matrixWorld );
						_vector3.applyProjection( _projScreenMatrix );

						webglObject.z = _vector3.z;

					}

				}

			}

		}

		for ( var i = 0, l = object.children.length; i < l; i ++ ) {

			projectObject( object.children[ i ] );

		}

	}

	function renderObjects( renderList, camera, lights, fog, overrideMaterial ) {

		var material;

		for ( var i = 0, l = renderList.length; i < l; i ++ ) {

			var webglObject = renderList[ i ];

			var object = webglObject.object;

			setupMatrices( object, camera );

			if ( overrideMaterial ) {

				material = overrideMaterial;

			} else {

				material = object.material;

				if ( ! material ) continue;

				setMaterial( material );

			}

			_this.setMaterialFaces( material );
			_this.renderBufferDirect( camera, lights, fog, material, object );

		}

	}

	function renderObjectsImmediate ( renderList, materialType, camera, lights, fog, overrideMaterial ) {

		var material;

		for ( var i = 0, l = renderList.length; i < l; i ++ ) {

			var webglObject = renderList[ i ];
			var object = webglObject.object;

			if ( object.visible ) {

				if ( overrideMaterial ) {

					material = overrideMaterial;

				} else {

					material = webglObject[ materialType ];

					if ( ! material ) continue;

					setMaterial( material );

				}

				_this.renderImmediateObject( camera, lights, fog, material, object );

			}

		}

	}

	this.renderImmediateObject = function ( camera, lights, fog, material, object ) {

		var program = setProgram( camera, lights, fog, material, object );

		_currentGeometryProgram = '';

		_this.setMaterialFaces( material );

		if ( object.immediateRenderCallback ) {

			object.immediateRenderCallback( program, _gl, _frustum );

		} else {

			object.render( function ( object ) { _this.renderBufferImmediate( object, program, material ); } );

		}

	};

	// Materials

	var shaderIDs = {
		MeshDepthMaterial: 'depth',
		MeshNormalMaterial: 'normal',
		MeshBasicMaterial: 'basic',
		MeshLambertMaterial: 'lambert',
		MeshPhongMaterial: 'phong',
		LineBasicMaterial: 'basic',
		LineDashedMaterial: 'dashed',
		PointCloudMaterial: 'particle_basic'
	};

	function initMaterial( material, lights, fog, object ) {

		var shaderID = shaderIDs[ material.type ];

		// heuristics to create shader parameters according to lights in the scene
		// (not to blow over maxLights budget)

		var maxLightCount = allocateLights( lights );
		var maxShadows = allocateShadows( lights );
		var maxBones = allocateBones( object );

		var parameters = {

			precision: _precision,
			supportsVertexTextures: _supportsVertexTextures,

			map: !! material.map,
			envMap: !! material.envMap,
			envMapMode: material.envMap && material.envMap.mapping,
			lightMap: !! material.lightMap,
			aoMap: !! material.aoMap,
			bumpMap: !! material.bumpMap,
			normalMap: !! material.normalMap,
			specularMap: !! material.specularMap,
			alphaMap: !! material.alphaMap,

			combine: material.combine,

			vertexColors: material.vertexColors,

			fog: fog,
			useFog: material.fog,
			fogExp: fog instanceof THREE.FogExp2,

			flatShading: material.shading === THREE.FlatShading,

			sizeAttenuation: material.sizeAttenuation,
			logarithmicDepthBuffer: _logarithmicDepthBuffer,

			skinning: material.skinning,
			maxBones: maxBones,
			useVertexTexture: _supportsBoneTextures && object && object.skeleton && object.skeleton.useVertexTexture,

			morphTargets: material.morphTargets,
			morphNormals: material.morphNormals,
			maxMorphTargets: _this.maxMorphTargets,
			maxMorphNormals: _this.maxMorphNormals,

			maxDirLights: maxLightCount.directional,
			maxPointLights: maxLightCount.point,
			maxSpotLights: maxLightCount.spot,
			maxHemiLights: maxLightCount.hemi,

			maxShadows: maxShadows,
			shadowMapEnabled: shadowMap.enabled && object.receiveShadow && maxShadows > 0,
			shadowMapType: shadowMap.type,
			shadowMapDebug: shadowMap.debug,
			shadowMapCascade: shadowMap.cascade,

			alphaTest: material.alphaTest,
			metal: material.metal,
			doubleSided: material.side === THREE.DoubleSide,
			flipSided: material.side === THREE.BackSide

		};

		// Generate code

		var chunks = [];

		if ( shaderID ) {

			chunks.push( shaderID );

		} else {

			chunks.push( material.fragmentShader );
			chunks.push( material.vertexShader );

		}

		if ( material.defines !== undefined ) {

			for ( var name in material.defines ) {

				chunks.push( name );
				chunks.push( material.defines[ name ] );

			}

		}

		for ( var name in parameters ) {

			chunks.push( name );
			chunks.push( parameters[ name ] );

		}

		var code = chunks.join();

		if ( !material.program ) {

			// new material
			material.addEventListener( 'dispose', onMaterialDispose );

		} else if ( material.program.code !== code ) {

			// changed glsl or parameters
			deallocateMaterial( material );

		} else if ( shaderID !== undefined ) {

			// same glsl
			return;

		} else if ( material.__webglShader.uniforms === material.uniforms ) {

			// same uniforms (container object)
			return;

		}

		if ( shaderID ) {

			var shader = THREE.ShaderLib[ shaderID ];

			material.__webglShader = {
				uniforms: THREE.UniformsUtils.clone( shader.uniforms ),
				vertexShader: shader.vertexShader,
				fragmentShader: shader.fragmentShader
			}

		} else {

			material.__webglShader = {
				uniforms: material.uniforms,
				vertexShader: material.vertexShader,
				fragmentShader: material.fragmentShader
			}

		}

		var program;

		// Check if code has been already compiled

		for ( var p = 0, pl = _programs.length; p < pl; p ++ ) {

			var programInfo = _programs[ p ];

			if ( programInfo.code === code ) {

				program = programInfo;
				program.usedTimes ++;

				break;

			}

		}

		if ( program === undefined ) {

			program = new THREE.WebGLProgram( _this, code, material, parameters );
			_programs.push( program );

			_this.info.memory.programs = _programs.length;

		}

		material.program = program;

		var attributes = program.attributes;

		if ( material.morphTargets ) {

			material.numSupportedMorphTargets = 0;

			for ( var i = 0; i < _this.maxMorphTargets; i ++ ) {

				if ( attributes[ 'morphTarget' + i ] >= 0 ) {

					material.numSupportedMorphTargets ++;

				}

			}

		}

		if ( material.morphNormals ) {

			material.numSupportedMorphNormals = 0;

			for ( i = 0; i < _this.maxMorphNormals; i ++ ) {

				if ( attributes[ 'morphNormal' + i ] >= 0 ) {

					material.numSupportedMorphNormals ++;

				}

			}

		}

		material.uniformsList = [];

		for ( var u in material.__webglShader.uniforms ) {

			var location = material.program.uniforms[ u ];

			if ( location ) {
				material.uniformsList.push( [ material.__webglShader.uniforms[ u ], location ] );
			}

		}

	}

	function setMaterial( material ) {

		if ( material.transparent === true ) {

			state.setBlending( material.blending, material.blendEquation, material.blendSrc, material.blendDst, material.blendEquationAlpha, material.blendSrcAlpha, material.blendDstAlpha );

		} else {

			state.setBlending( THREE.NoBlending );

		}

		state.setDepthFunc( material.depthFunc );
		state.setDepthTest( material.depthTest );
		state.setDepthWrite( material.depthWrite );
		state.setColorWrite( material.colorWrite );
		state.setPolygonOffset( material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits );

	}

	function setProgram( camera, lights, fog, material, object ) {

		_usedTextureUnits = 0;

		if ( material.needsUpdate ) {

			initMaterial( material, lights, fog, object );
			material.needsUpdate = false;

		}

		/*
		if ( material.morphTargets ) {

			if ( ! object.__webglMorphTargetInfluences ) {

				object.__webglMorphTargetInfluences = new Float32Array( _this.maxMorphTargets );

			}

		}
		*/

		var refreshProgram = false;
		var refreshMaterial = false;
		var refreshLights = false;

		var program = material.program,
			p_uniforms = program.uniforms,
			m_uniforms = material.__webglShader.uniforms;

		if ( program.id !== _currentProgram ) {

			_gl.useProgram( program.program );
			_currentProgram = program.id;

			refreshProgram = true;
			refreshMaterial = true;
			refreshLights = true;

		}

		if ( material.id !== _currentMaterialId ) {

			if ( _currentMaterialId === -1 ) refreshLights = true;
			_currentMaterialId = material.id;

			refreshMaterial = true;

		}

		if ( refreshProgram || camera !== _currentCamera ) {

			_gl.uniformMatrix4fv( p_uniforms.projectionMatrix, false, camera.projectionMatrix.elements );

			if ( _logarithmicDepthBuffer ) {

				_gl.uniform1f( p_uniforms.logDepthBufFC, 2.0 / ( Math.log( camera.far + 1.0 ) / Math.LN2 ) );

			}


			if ( camera !== _currentCamera ) _currentCamera = camera;

			// load material specific uniforms
			// (shader material also gets them for the sake of genericity)

			if ( material instanceof THREE.ShaderMaterial ||
				 material instanceof THREE.MeshPhongMaterial ||
				 material.envMap ) {

				if ( p_uniforms.cameraPosition !== null ) {

					_vector3.setFromMatrixPosition( camera.matrixWorld );
					_gl.uniform3f( p_uniforms.cameraPosition, _vector3.x, _vector3.y, _vector3.z );

				}

			}

			if ( material instanceof THREE.MeshPhongMaterial ||
				 material instanceof THREE.MeshLambertMaterial ||
				 material instanceof THREE.MeshBasicMaterial ||
				 material instanceof THREE.ShaderMaterial ||
				 material.skinning ) {

				if ( p_uniforms.viewMatrix !== null ) {

					_gl.uniformMatrix4fv( p_uniforms.viewMatrix, false, camera.matrixWorldInverse.elements );

				}

			}

		}

		// skinning uniforms must be set even if material didn't change
		// auto-setting of texture unit for bone texture must go before other textures
		// not sure why, but otherwise weird things happen

		if ( material.skinning ) {

			if ( object.bindMatrix && p_uniforms.bindMatrix !== null ) {

				_gl.uniformMatrix4fv( p_uniforms.bindMatrix, false, object.bindMatrix.elements );

			}

			if ( object.bindMatrixInverse && p_uniforms.bindMatrixInverse !== null ) {

				_gl.uniformMatrix4fv( p_uniforms.bindMatrixInverse, false, object.bindMatrixInverse.elements );

			}

			if ( _supportsBoneTextures && object.skeleton && object.skeleton.useVertexTexture ) {

				if ( p_uniforms.boneTexture !== null ) {

					var textureUnit = getTextureUnit();

					_gl.uniform1i( p_uniforms.boneTexture, textureUnit );
					_this.setTexture( object.skeleton.boneTexture, textureUnit );

				}

				if ( p_uniforms.boneTextureWidth !== null ) {

					_gl.uniform1i( p_uniforms.boneTextureWidth, object.skeleton.boneTextureWidth );

				}

				if ( p_uniforms.boneTextureHeight !== null ) {

					_gl.uniform1i( p_uniforms.boneTextureHeight, object.skeleton.boneTextureHeight );

				}

			} else if ( object.skeleton && object.skeleton.boneMatrices ) {

				if ( p_uniforms.boneGlobalMatrices !== null ) {

					_gl.uniformMatrix4fv( p_uniforms.boneGlobalMatrices, false, object.skeleton.boneMatrices );

				}

			}

		}

		if ( refreshMaterial ) {

			// refresh uniforms common to several materials

			if ( fog && material.fog ) {

				refreshUniformsFog( m_uniforms, fog );

			}

			if ( material instanceof THREE.MeshPhongMaterial ||
				 material instanceof THREE.MeshLambertMaterial ||
				 material.lights ) {

				if ( _lightsNeedUpdate ) {

					refreshLights = true;
					setupLights( lights );
					_lightsNeedUpdate = false;
				}

				if ( refreshLights ) {
					refreshUniformsLights( m_uniforms, _lights );
					markUniformsLightsNeedsUpdate( m_uniforms, true );
				} else {
					markUniformsLightsNeedsUpdate( m_uniforms, false );
				}

			}

			if ( material instanceof THREE.MeshBasicMaterial ||
				 material instanceof THREE.MeshLambertMaterial ||
				 material instanceof THREE.MeshPhongMaterial ) {

				refreshUniformsCommon( m_uniforms, material );

			}

			// refresh single material specific uniforms

			if ( material instanceof THREE.LineBasicMaterial ) {

				refreshUniformsLine( m_uniforms, material );

			} else if ( material instanceof THREE.LineDashedMaterial ) {

				refreshUniformsLine( m_uniforms, material );
				refreshUniformsDash( m_uniforms, material );

			} else if ( material instanceof THREE.PointCloudMaterial ) {

				refreshUniformsParticle( m_uniforms, material );

			} else if ( material instanceof THREE.MeshPhongMaterial ) {

				refreshUniformsPhong( m_uniforms, material );

			} else if ( material instanceof THREE.MeshLambertMaterial ) {

				refreshUniformsLambert( m_uniforms, material );

			} else if ( material instanceof THREE.MeshDepthMaterial ) {

				m_uniforms.mNear.value = camera.near;
				m_uniforms.mFar.value = camera.far;
				m_uniforms.opacity.value = material.opacity;

			} else if ( material instanceof THREE.MeshNormalMaterial ) {

				m_uniforms.opacity.value = material.opacity;

			}

			if ( object.receiveShadow && ! material._shadowPass ) {

				refreshUniformsShadow( m_uniforms, lights );

			}

			// load common uniforms

			loadUniformsGeneric( material.uniformsList );

		}

		loadUniformsMatrices( p_uniforms, object );

		if ( p_uniforms.modelMatrix !== null ) {

			_gl.uniformMatrix4fv( p_uniforms.modelMatrix, false, object.matrixWorld.elements );

		}

		return program;

	}

	// Uniforms (refresh uniforms objects)

	function refreshUniformsCommon ( uniforms, material ) {

		uniforms.opacity.value = material.opacity;

		uniforms.diffuse.value = material.color;

		uniforms.map.value = material.map;
		uniforms.specularMap.value = material.specularMap;
		uniforms.alphaMap.value = material.alphaMap;

		if ( material.bumpMap ) {

			uniforms.bumpMap.value = material.bumpMap;
			uniforms.bumpScale.value = material.bumpScale;

		}

		if ( material.normalMap ) {

			uniforms.normalMap.value = material.normalMap;
			uniforms.normalScale.value.copy( material.normalScale );

		}

		// uv repeat and offset setting priorities
		// 1. color map
		// 2. specular map
		// 3. normal map
		// 4. bump map
		// 5. alpha map

		var uvScaleMap;

		if ( material.map ) {

			uvScaleMap = material.map;

		} else if ( material.specularMap ) {

			uvScaleMap = material.specularMap;

		} else if ( material.normalMap ) {

			uvScaleMap = material.normalMap;

		} else if ( material.bumpMap ) {

			uvScaleMap = material.bumpMap;

		} else if ( material.alphaMap ) {

			uvScaleMap = material.alphaMap;

		}

		if ( uvScaleMap !== undefined ) {

			var offset = uvScaleMap.offset;
			var repeat = uvScaleMap.repeat;

			uniforms.offsetRepeat.value.set( offset.x, offset.y, repeat.x, repeat.y );

		}

		uniforms.envMap.value = material.envMap;
		uniforms.flipEnvMap.value = ( material.envMap instanceof THREE.WebGLRenderTargetCube ) ? 1 : - 1;

		uniforms.reflectivity.value = material.reflectivity;
		uniforms.refractionRatio.value = material.refractionRatio;

	}

	function refreshUniformsLine ( uniforms, material ) {

		uniforms.diffuse.value = material.color;
		uniforms.opacity.value = material.opacity;

	}

	function refreshUniformsDash ( uniforms, material ) {

		uniforms.dashSize.value = material.dashSize;
		uniforms.totalSize.value = material.dashSize + material.gapSize;
		uniforms.scale.value = material.scale;

	}

	function refreshUniformsParticle ( uniforms, material ) {

		uniforms.psColor.value = material.color;
		uniforms.opacity.value = material.opacity;
		uniforms.size.value = material.size;
		uniforms.scale.value = _canvas.height / 2.0; // TODO: Cache this.

		uniforms.map.value = material.map;

		if ( material.map !== null ) {

			var offset = material.map.offset;
			var repeat = material.map.repeat;

			uniforms.offsetRepeat.value.set( offset.x, offset.y, repeat.x, repeat.y );

		}

	}

	function refreshUniformsFog ( uniforms, fog ) {

		uniforms.fogColor.value = fog.color;

		if ( fog instanceof THREE.Fog ) {

			uniforms.fogNear.value = fog.near;
			uniforms.fogFar.value = fog.far;

		} else if ( fog instanceof THREE.FogExp2 ) {

			uniforms.fogDensity.value = fog.density;

		}

	}

	function refreshUniformsPhong ( uniforms, material ) {

		uniforms.shininess.value = material.shininess;

		uniforms.emissive.value = material.emissive;
		uniforms.specular.value = material.specular;

		uniforms.lightMap.value = material.lightMap;
		uniforms.lightMapIntensity.value = material.lightMapIntensity;

		uniforms.aoMap.value = material.aoMap;
		uniforms.aoMapIntensity.value = material.aoMapIntensity;

	}

	function refreshUniformsLambert ( uniforms, material ) {

		uniforms.emissive.value = material.emissive;

	}

	function refreshUniformsLights ( uniforms, lights ) {

		uniforms.ambientLightColor.value = lights.ambient;

		uniforms.directionalLightColor.value = lights.directional.colors;
		uniforms.directionalLightDirection.value = lights.directional.positions;

		uniforms.pointLightColor.value = lights.point.colors;
		uniforms.pointLightPosition.value = lights.point.positions;
		uniforms.pointLightDistance.value = lights.point.distances;
		uniforms.pointLightDecay.value = lights.point.decays;

		uniforms.spotLightColor.value = lights.spot.colors;
		uniforms.spotLightPosition.value = lights.spot.positions;
		uniforms.spotLightDistance.value = lights.spot.distances;
		uniforms.spotLightDirection.value = lights.spot.directions;
		uniforms.spotLightAngleCos.value = lights.spot.anglesCos;
		uniforms.spotLightExponent.value = lights.spot.exponents;
		uniforms.spotLightDecay.value = lights.spot.decays;

		uniforms.hemisphereLightSkyColor.value = lights.hemi.skyColors;
		uniforms.hemisphereLightGroundColor.value = lights.hemi.groundColors;
		uniforms.hemisphereLightDirection.value = lights.hemi.positions;

	}

	// If uniforms are marked as clean, they don't need to be loaded to the GPU.

	function markUniformsLightsNeedsUpdate ( uniforms, value ) {

		uniforms.ambientLightColor.needsUpdate = value;

		uniforms.directionalLightColor.needsUpdate = value;
		uniforms.directionalLightDirection.needsUpdate = value;

		uniforms.pointLightColor.needsUpdate = value;
		uniforms.pointLightPosition.needsUpdate = value;
		uniforms.pointLightDistance.needsUpdate = value;
		uniforms.pointLightDecay.needsUpdate = value;

		uniforms.spotLightColor.needsUpdate = value;
		uniforms.spotLightPosition.needsUpdate = value;
		uniforms.spotLightDistance.needsUpdate = value;
		uniforms.spotLightDirection.needsUpdate = value;
		uniforms.spotLightAngleCos.needsUpdate = value;
		uniforms.spotLightExponent.needsUpdate = value;
		uniforms.spotLightDecay.needsUpdate = value;

		uniforms.hemisphereLightSkyColor.needsUpdate = value;
		uniforms.hemisphereLightGroundColor.needsUpdate = value;
		uniforms.hemisphereLightDirection.needsUpdate = value;

	}

	function refreshUniformsShadow ( uniforms, lights ) {

		if ( uniforms.shadowMatrix ) {

			var j = 0;

			for ( var i = 0, il = lights.length; i < il; i ++ ) {

				var light = lights[ i ];

				if ( ! light.castShadow ) continue;

				if ( light instanceof THREE.SpotLight || ( light instanceof THREE.DirectionalLight && ! light.shadowCascade ) ) {

					uniforms.shadowMap.value[ j ] = light.shadowMap;
					uniforms.shadowMapSize.value[ j ] = light.shadowMapSize;

					uniforms.shadowMatrix.value[ j ] = light.shadowMatrix;

					uniforms.shadowDarkness.value[ j ] = light.shadowDarkness;
					uniforms.shadowBias.value[ j ] = light.shadowBias;

					j ++;

				}

			}

		}

	}

	// Uniforms (load to GPU)

	function loadUniformsMatrices ( uniforms, object ) {

		_gl.uniformMatrix4fv( uniforms.modelViewMatrix, false, object._modelViewMatrix.elements );

		if ( uniforms.normalMatrix ) {

			_gl.uniformMatrix3fv( uniforms.normalMatrix, false, object._normalMatrix.elements );

		}

	}

	function getTextureUnit() {

		var textureUnit = _usedTextureUnits;

		if ( textureUnit >= _maxTextures ) {

			console.warn( 'WebGLRenderer: trying to use ' + textureUnit + ' texture units while this GPU supports only ' + _maxTextures );

		}

		_usedTextureUnits += 1;

		return textureUnit;

	}

	function loadUniformsGeneric ( uniforms ) {

		var texture, textureUnit, offset;

		for ( var j = 0, jl = uniforms.length; j < jl; j ++ ) {

			var uniform = uniforms[ j ][ 0 ];

			// needsUpdate property is not added to all uniforms.
			if ( uniform.needsUpdate === false ) continue;

			var type = uniform.type;
			var value = uniform.value;
			var location = uniforms[ j ][ 1 ];

			switch ( type ) {

				case '1i':
					_gl.uniform1i( location, value );
					break;

				case '1f':
					_gl.uniform1f( location, value );
					break;

				case '2f':
					_gl.uniform2f( location, value[ 0 ], value[ 1 ] );
					break;

				case '3f':
					_gl.uniform3f( location, value[ 0 ], value[ 1 ], value[ 2 ] );
					break;

				case '4f':
					_gl.uniform4f( location, value[ 0 ], value[ 1 ], value[ 2 ], value[ 3 ] );
					break;

				case '1iv':
					_gl.uniform1iv( location, value );
					break;

				case '3iv':
					_gl.uniform3iv( location, value );
					break;

				case '1fv':
					_gl.uniform1fv( location, value );
					break;

				case '2fv':
					_gl.uniform2fv( location, value );
					break;

				case '3fv':
					_gl.uniform3fv( location, value );
					break;

				case '4fv':
					_gl.uniform4fv( location, value );
					break;

				case 'Matrix3fv':
					_gl.uniformMatrix3fv( location, false, value );
					break;

				case 'Matrix4fv':
					_gl.uniformMatrix4fv( location, false, value );
					break;

				//

				case 'i':

					// single integer
					_gl.uniform1i( location, value );

					break;

				case 'f':

					// single float
					_gl.uniform1f( location, value );

					break;

				case 'v2':

					// single THREE.Vector2
					_gl.uniform2f( location, value.x, value.y );

					break;

				case 'v3':

					// single THREE.Vector3
					_gl.uniform3f( location, value.x, value.y, value.z );

					break;

				case 'v4':

					// single THREE.Vector4
					_gl.uniform4f( location, value.x, value.y, value.z, value.w );

					break;

				case 'c':

					// single THREE.Color
					_gl.uniform3f( location, value.r, value.g, value.b );

					break;

				case 'iv1':

					// flat array of integers (JS or typed array)
					_gl.uniform1iv( location, value );

					break;

				case 'iv':

					// flat array of integers with 3 x N size (JS or typed array)
					_gl.uniform3iv( location, value );

					break;

				case 'fv1':

					// flat array of floats (JS or typed array)
					_gl.uniform1fv( location, value );

					break;

				case 'fv':

					// flat array of floats with 3 x N size (JS or typed array)
					_gl.uniform3fv( location, value );

					break;

				case 'v2v':

					// array of THREE.Vector2

					if ( uniform._array === undefined ) {

						uniform._array = new Float32Array( 2 * value.length );

					}

					for ( var i = 0, il = value.length; i < il; i ++ ) {

						offset = i * 2;

						uniform._array[ offset + 0 ] = value[ i ].x;
						uniform._array[ offset + 1 ] = value[ i ].y;

					}

					_gl.uniform2fv( location, uniform._array );

					break;

				case 'v3v':

					// array of THREE.Vector3

					if ( uniform._array === undefined ) {

						uniform._array = new Float32Array( 3 * value.length );

					}

					for ( var i = 0, il = value.length; i < il; i ++ ) {

						offset = i * 3;

						uniform._array[ offset + 0 ] = value[ i ].x;
						uniform._array[ offset + 1 ] = value[ i ].y;
						uniform._array[ offset + 2 ] = value[ i ].z;

					}

					_gl.uniform3fv( location, uniform._array );

					break;

				case 'v4v':

					// array of THREE.Vector4

					if ( uniform._array === undefined ) {

						uniform._array = new Float32Array( 4 * value.length );

					}

					for ( var i = 0, il = value.length; i < il; i ++ ) {

						offset = i * 4;

						uniform._array[ offset + 0 ] = value[ i ].x;
						uniform._array[ offset + 1 ] = value[ i ].y;
						uniform._array[ offset + 2 ] = value[ i ].z;
						uniform._array[ offset + 3 ] = value[ i ].w;

					}

					_gl.uniform4fv( location, uniform._array );

					break;

				case 'm3':

					// single THREE.Matrix3
					_gl.uniformMatrix3fv( location, false, value.elements );

					break;

				case 'm3v':

					// array of THREE.Matrix3

					if ( uniform._array === undefined ) {

						uniform._array = new Float32Array( 9 * value.length );

					}

					for ( var i = 0, il = value.length; i < il; i ++ ) {

						value[ i ].flattenToArrayOffset( uniform._array, i * 9 );

					}

					_gl.uniformMatrix3fv( location, false, uniform._array );

					break;

				case 'm4':

					// single THREE.Matrix4
					_gl.uniformMatrix4fv( location, false, value.elements );

					break;

				case 'm4v':

					// array of THREE.Matrix4

					if ( uniform._array === undefined ) {

						uniform._array = new Float32Array( 16 * value.length );

					}

					for ( var i = 0, il = value.length; i < il; i ++ ) {

						value[ i ].flattenToArrayOffset( uniform._array, i * 16 );

					}

					_gl.uniformMatrix4fv( location, false, uniform._array );

					break;

				case 't':

					// single THREE.Texture (2d or cube)

					texture = value;
					textureUnit = getTextureUnit();

					_gl.uniform1i( location, textureUnit );

					if ( ! texture ) continue;

					if ( texture instanceof THREE.CubeTexture ||
						 ( texture.image instanceof Array && texture.image.length === 6 ) ) { // CompressedTexture can have Array in image :/

						setCubeTexture( texture, textureUnit );

					} else if ( texture instanceof THREE.WebGLRenderTargetCube ) {

						setCubeTextureDynamic( texture, textureUnit );

					} else {

						_this.setTexture( texture, textureUnit );

					}

					break;

				case 'tv':

					// array of THREE.Texture (2d)

					if ( uniform._array === undefined ) {

						uniform._array = [];

					}

					for ( var i = 0, il = uniform.value.length; i < il; i ++ ) {

						uniform._array[ i ] = getTextureUnit();

					}

					_gl.uniform1iv( location, uniform._array );

					for ( var i = 0, il = uniform.value.length; i < il; i ++ ) {

						texture = uniform.value[ i ];
						textureUnit = uniform._array[ i ];

						if ( ! texture ) continue;

						_this.setTexture( texture, textureUnit );

					}

					break;

				default:

					console.warn( 'THREE.WebGLRenderer: Unknown uniform type: ' + type );

			}

		}

	}

	function setupMatrices ( object, camera ) {

		object._modelViewMatrix.multiplyMatrices( camera.matrixWorldInverse, object.matrixWorld );
		object._normalMatrix.getNormalMatrix( object._modelViewMatrix );

	}

	function setColorLinear( array, offset, color, intensity ) {

		array[ offset + 0 ] = color.r * intensity;
		array[ offset + 1 ] = color.g * intensity;
		array[ offset + 2 ] = color.b * intensity;

	}

	function setupLights ( lights ) {

		var l, ll, light,
		r = 0, g = 0, b = 0,
		color, skyColor, groundColor,
		intensity,
		distance,

		zlights = _lights,

		dirColors = zlights.directional.colors,
		dirPositions = zlights.directional.positions,

		pointColors = zlights.point.colors,
		pointPositions = zlights.point.positions,
		pointDistances = zlights.point.distances,
		pointDecays = zlights.point.decays,

		spotColors = zlights.spot.colors,
		spotPositions = zlights.spot.positions,
		spotDistances = zlights.spot.distances,
		spotDirections = zlights.spot.directions,
		spotAnglesCos = zlights.spot.anglesCos,
		spotExponents = zlights.spot.exponents,
		spotDecays = zlights.spot.decays,

		hemiSkyColors = zlights.hemi.skyColors,
		hemiGroundColors = zlights.hemi.groundColors,
		hemiPositions = zlights.hemi.positions,

		dirLength = 0,
		pointLength = 0,
		spotLength = 0,
		hemiLength = 0,

		dirCount = 0,
		pointCount = 0,
		spotCount = 0,
		hemiCount = 0,

		dirOffset = 0,
		pointOffset = 0,
		spotOffset = 0,
		hemiOffset = 0;

		for ( l = 0, ll = lights.length; l < ll; l ++ ) {

			light = lights[ l ];

			if ( light.onlyShadow ) continue;

			color = light.color;
			intensity = light.intensity;
			distance = light.distance;

			if ( light instanceof THREE.AmbientLight ) {

				if ( ! light.visible ) continue;

				r += color.r;
				g += color.g;
				b += color.b;

			} else if ( light instanceof THREE.DirectionalLight ) {

				dirCount += 1;

				if ( ! light.visible ) continue;

				_direction.setFromMatrixPosition( light.matrixWorld );
				_vector3.setFromMatrixPosition( light.target.matrixWorld );
				_direction.sub( _vector3 );
				_direction.normalize();

				dirOffset = dirLength * 3;

				dirPositions[ dirOffset + 0 ] = _direction.x;
				dirPositions[ dirOffset + 1 ] = _direction.y;
				dirPositions[ dirOffset + 2 ] = _direction.z;

				setColorLinear( dirColors, dirOffset, color, intensity );

				dirLength += 1;

			} else if ( light instanceof THREE.PointLight ) {

				pointCount += 1;

				if ( ! light.visible ) continue;

				pointOffset = pointLength * 3;

				setColorLinear( pointColors, pointOffset, color, intensity );

				_vector3.setFromMatrixPosition( light.matrixWorld );

				pointPositions[ pointOffset + 0 ] = _vector3.x;
				pointPositions[ pointOffset + 1 ] = _vector3.y;
				pointPositions[ pointOffset + 2 ] = _vector3.z;

				// distance is 0 if decay is 0, because there is no attenuation at all.
				pointDistances[ pointLength ] = distance;
				pointDecays[ pointLength ] = ( light.distance === 0 ) ? 0.0 : light.decay;

				pointLength += 1;

			} else if ( light instanceof THREE.SpotLight ) {

				spotCount += 1;

				if ( ! light.visible ) continue;

				spotOffset = spotLength * 3;

				setColorLinear( spotColors, spotOffset, color, intensity );

				_direction.setFromMatrixPosition( light.matrixWorld );

				spotPositions[ spotOffset + 0 ] = _direction.x;
				spotPositions[ spotOffset + 1 ] = _direction.y;
				spotPositions[ spotOffset + 2 ] = _direction.z;

				spotDistances[ spotLength ] = distance;

				_vector3.setFromMatrixPosition( light.target.matrixWorld );
				_direction.sub( _vector3 );
				_direction.normalize();

				spotDirections[ spotOffset + 0 ] = _direction.x;
				spotDirections[ spotOffset + 1 ] = _direction.y;
				spotDirections[ spotOffset + 2 ] = _direction.z;

				spotAnglesCos[ spotLength ] = Math.cos( light.angle );
				spotExponents[ spotLength ] = light.exponent;
				spotDecays[ spotLength ] = ( light.distance === 0 ) ? 0.0 : light.decay;

				spotLength += 1;

			} else if ( light instanceof THREE.HemisphereLight ) {

				hemiCount += 1;

				if ( ! light.visible ) continue;

				_direction.setFromMatrixPosition( light.matrixWorld );
				_direction.normalize();

				hemiOffset = hemiLength * 3;

				hemiPositions[ hemiOffset + 0 ] = _direction.x;
				hemiPositions[ hemiOffset + 1 ] = _direction.y;
				hemiPositions[ hemiOffset + 2 ] = _direction.z;

				skyColor = light.color;
				groundColor = light.groundColor;

				setColorLinear( hemiSkyColors, hemiOffset, skyColor, intensity );
				setColorLinear( hemiGroundColors, hemiOffset, groundColor, intensity );

				hemiLength += 1;

			}

		}

		// null eventual remains from removed lights
		// (this is to avoid if in shader)

		for ( l = dirLength * 3, ll = Math.max( dirColors.length, dirCount * 3 ); l < ll; l ++ ) dirColors[ l ] = 0.0;
		for ( l = pointLength * 3, ll = Math.max( pointColors.length, pointCount * 3 ); l < ll; l ++ ) pointColors[ l ] = 0.0;
		for ( l = spotLength * 3, ll = Math.max( spotColors.length, spotCount * 3 ); l < ll; l ++ ) spotColors[ l ] = 0.0;
		for ( l = hemiLength * 3, ll = Math.max( hemiSkyColors.length, hemiCount * 3 ); l < ll; l ++ ) hemiSkyColors[ l ] = 0.0;
		for ( l = hemiLength * 3, ll = Math.max( hemiGroundColors.length, hemiCount * 3 ); l < ll; l ++ ) hemiGroundColors[ l ] = 0.0;

		zlights.directional.length = dirLength;
		zlights.point.length = pointLength;
		zlights.spot.length = spotLength;
		zlights.hemi.length = hemiLength;

		zlights.ambient[ 0 ] = r;
		zlights.ambient[ 1 ] = g;
		zlights.ambient[ 2 ] = b;

	}

	// GL state setting

	this.setFaceCulling = function ( cullFace, frontFaceDirection ) {

		if ( cullFace === THREE.CullFaceNone ) {

			_gl.disable( _gl.CULL_FACE );

		} else {

			if ( frontFaceDirection === THREE.FrontFaceDirectionCW ) {

				_gl.frontFace( _gl.CW );

			} else {

				_gl.frontFace( _gl.CCW );

			}

			if ( cullFace === THREE.CullFaceBack ) {

				_gl.cullFace( _gl.BACK );

			} else if ( cullFace === THREE.CullFaceFront ) {

				_gl.cullFace( _gl.FRONT );

			} else {

				_gl.cullFace( _gl.FRONT_AND_BACK );

			}

			_gl.enable( _gl.CULL_FACE );

		}

	};

	this.setMaterialFaces = function ( material ) {

		state.setDoubleSided( material.side === THREE.DoubleSide );
		state.setFlipSided( material.side === THREE.BackSide );

	};

	// Textures

	function setTextureParameters ( textureType, texture, isImagePowerOfTwo ) {

		var extension;

		if ( isImagePowerOfTwo ) {

			_gl.texParameteri( textureType, _gl.TEXTURE_WRAP_S, paramThreeToGL( texture.wrapS ) );
			_gl.texParameteri( textureType, _gl.TEXTURE_WRAP_T, paramThreeToGL( texture.wrapT ) );

			_gl.texParameteri( textureType, _gl.TEXTURE_MAG_FILTER, paramThreeToGL( texture.magFilter ) );
			_gl.texParameteri( textureType, _gl.TEXTURE_MIN_FILTER, paramThreeToGL( texture.minFilter ) );

		} else {

			_gl.texParameteri( textureType, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE );
			_gl.texParameteri( textureType, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE );

			if ( texture.wrapS !== THREE.ClampToEdgeWrapping || texture.wrapT !== THREE.ClampToEdgeWrapping ) {

				console.warn( 'THREE.WebGLRenderer: Texture is not power of two. Texture.wrapS and Texture.wrapT should be set to THREE.ClampToEdgeWrapping. ( ' + texture.sourceFile + ' )' );

			}

			_gl.texParameteri( textureType, _gl.TEXTURE_MAG_FILTER, filterFallback( texture.magFilter ) );
			_gl.texParameteri( textureType, _gl.TEXTURE_MIN_FILTER, filterFallback( texture.minFilter ) );

			if ( texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter ) {

				console.warn( 'THREE.WebGLRenderer: Texture is not power of two. Texture.minFilter should be set to THREE.NearestFilter or THREE.LinearFilter. ( ' + texture.sourceFile + ' )' );

			}

		}

		extension = extensions.get( 'EXT_texture_filter_anisotropic' );

		if ( extension && texture.type !== THREE.FloatType && texture.type !== THREE.HalfFloatType ) {

			if ( texture.anisotropy > 1 || texture.__currentAnisotropy ) {

				_gl.texParameterf( textureType, extension.TEXTURE_MAX_ANISOTROPY_EXT, Math.min( texture.anisotropy, _this.getMaxAnisotropy() ) );
				texture.__currentAnisotropy = texture.anisotropy;

			}

		}

	}

	this.uploadTexture = function ( texture, slot ) {

		if ( texture.__webglInit === undefined ) {

			texture.__webglInit = true;

			texture.addEventListener( 'dispose', onTextureDispose );

			texture.__webglTexture = _gl.createTexture();

			_this.info.memory.textures ++;

		}

		state.activeTexture( _gl.TEXTURE0 + slot );
		state.bindTexture( _gl.TEXTURE_2D, texture.__webglTexture );

		_gl.pixelStorei( _gl.UNPACK_FLIP_Y_WEBGL, texture.flipY );
		_gl.pixelStorei( _gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha );
		_gl.pixelStorei( _gl.UNPACK_ALIGNMENT, texture.unpackAlignment );

		texture.image = clampToMaxSize( texture.image, _maxTextureSize );

		var image = texture.image,
		isImagePowerOfTwo = THREE.Math.isPowerOfTwo( image.width ) && THREE.Math.isPowerOfTwo( image.height ),
		glFormat = paramThreeToGL( texture.format ),
		glType = paramThreeToGL( texture.type );

		setTextureParameters( _gl.TEXTURE_2D, texture, isImagePowerOfTwo );

		var mipmap, mipmaps = texture.mipmaps;

		if ( texture instanceof THREE.DataTexture ) {

			// use manually created mipmaps if available
			// if there are no manual mipmaps
			// set 0 level mipmap and then use GL to generate other mipmap levels

			if ( mipmaps.length > 0 && isImagePowerOfTwo ) {

				for ( var i = 0, il = mipmaps.length; i < il; i ++ ) {

					mipmap = mipmaps[ i ];
					_gl.texImage2D( _gl.TEXTURE_2D, i, glFormat, mipmap.width, mipmap.height, 0, glFormat, glType, mipmap.data );

				}

				texture.generateMipmaps = false;

			} else {

				_gl.texImage2D( _gl.TEXTURE_2D, 0, glFormat, image.width, image.height, 0, glFormat, glType, image.data );

			}

		} else if ( texture instanceof THREE.CompressedTexture ) {

			for ( var i = 0, il = mipmaps.length; i < il; i ++ ) {

				mipmap = mipmaps[ i ];

				if ( texture.format !== THREE.RGBAFormat && texture.format !== THREE.RGBFormat ) {

					if ( getCompressedTextureFormats().indexOf( glFormat ) > -1 ) {

						_gl.compressedTexImage2D( _gl.TEXTURE_2D, i, glFormat, mipmap.width, mipmap.height, 0, mipmap.data );

					} else {

						console.warn( "THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()" );

					}

				} else {

					_gl.texImage2D( _gl.TEXTURE_2D, i, glFormat, mipmap.width, mipmap.height, 0, glFormat, glType, mipmap.data );

				}

			}

		} else { // regular Texture (image, video, canvas)

			// use manually created mipmaps if available
			// if there are no manual mipmaps
			// set 0 level mipmap and then use GL to generate other mipmap levels

			if ( mipmaps.length > 0 && isImagePowerOfTwo ) {

				for ( var i = 0, il = mipmaps.length; i < il; i ++ ) {

					mipmap = mipmaps[ i ];
					_gl.texImage2D( _gl.TEXTURE_2D, i, glFormat, glFormat, glType, mipmap );

				}

				texture.generateMipmaps = false;

			} else {

				_gl.texImage2D( _gl.TEXTURE_2D, 0, glFormat, glFormat, glType, texture.image );

			}

		}

		if ( texture.generateMipmaps && isImagePowerOfTwo ) _gl.generateMipmap( _gl.TEXTURE_2D );

		texture.needsUpdate = false;

		if ( texture.onUpdate ) texture.onUpdate( texture );

	};

	this.setTexture = function ( texture, slot ) {

		if ( texture.needsUpdate === true ) {

			var image = texture.image;

			if ( image === undefined ) {

				console.warn( 'THREE.WebGLRenderer: Texture marked for update but image is undefined', texture );
				return;

			}

			if ( image.complete === false ) {

				console.warn( 'THREE.WebGLRenderer: Texture marked for update but image is incomplete', texture );
				return;

			}

			_this.uploadTexture( texture, slot );
			return;

		}

		state.activeTexture( _gl.TEXTURE0 + slot );
		state.bindTexture( _gl.TEXTURE_2D, texture.__webglTexture );

	};

	function clampToMaxSize ( image, maxSize ) {

		if ( image.width > maxSize || image.height > maxSize ) {

			// Warning: Scaling through the canvas will only work with images that use
			// premultiplied alpha.

			var scale = maxSize / Math.max( image.width, image.height );

			var canvas = document.createElement( 'canvas' );
			canvas.width = Math.floor( image.width * scale );
			canvas.height = Math.floor( image.height * scale );

			var context = canvas.getContext( '2d' );
			context.drawImage( image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height );

			console.warn( 'THREE.WebGLRenderer: image is too big (' + image.width + 'x' + image.height + '). Resized to ' + canvas.width + 'x' + canvas.height, image );

			return canvas;

		}

		return image;

	}

	function setCubeTexture ( texture, slot ) {

		if ( texture.image.length === 6 ) {

			if ( texture.needsUpdate ) {

				if ( ! texture.image.__webglTextureCube ) {

					texture.addEventListener( 'dispose', onTextureDispose );

					texture.image.__webglTextureCube = _gl.createTexture();

					_this.info.memory.textures ++;

				}

				state.activeTexture( _gl.TEXTURE0 + slot );
				state.bindTexture( _gl.TEXTURE_CUBE_MAP, texture.image.__webglTextureCube );

				_gl.pixelStorei( _gl.UNPACK_FLIP_Y_WEBGL, texture.flipY );

				var isCompressed = texture instanceof THREE.CompressedTexture;
				var isDataTexture = texture.image[ 0 ] instanceof THREE.DataTexture;

				var cubeImage = [];

				for ( var i = 0; i < 6; i ++ ) {

					if ( _this.autoScaleCubemaps && ! isCompressed && ! isDataTexture ) {

						cubeImage[ i ] = clampToMaxSize( texture.image[ i ], _maxCubemapSize );

					} else {

						cubeImage[ i ] = isDataTexture ? texture.image[ i ].image : texture.image[ i ];

					}

				}

				var image = cubeImage[ 0 ],
				isImagePowerOfTwo = THREE.Math.isPowerOfTwo( image.width ) && THREE.Math.isPowerOfTwo( image.height ),
				glFormat = paramThreeToGL( texture.format ),
				glType = paramThreeToGL( texture.type );

				setTextureParameters( _gl.TEXTURE_CUBE_MAP, texture, isImagePowerOfTwo );

				for ( var i = 0; i < 6; i ++ ) {

					if ( ! isCompressed ) {

						if ( isDataTexture ) {

							_gl.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, glFormat, cubeImage[ i ].width, cubeImage[ i ].height, 0, glFormat, glType, cubeImage[ i ].data );

						} else {

							_gl.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, glFormat, glFormat, glType, cubeImage[ i ] );

						}

					} else {

						var mipmap, mipmaps = cubeImage[ i ].mipmaps;

						for ( var j = 0, jl = mipmaps.length; j < jl; j ++ ) {

							mipmap = mipmaps[ j ];

							if ( texture.format !== THREE.RGBAFormat && texture.format !== THREE.RGBFormat ) {

								if ( getCompressedTextureFormats().indexOf( glFormat ) > -1 ) {

									_gl.compressedTexImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, j, glFormat, mipmap.width, mipmap.height, 0, mipmap.data );

								} else {

									console.warn( "THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setCubeTexture()" );

								}

							} else {

								_gl.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, j, glFormat, mipmap.width, mipmap.height, 0, glFormat, glType, mipmap.data );

							}

						}

					}

				}

				if ( texture.generateMipmaps && isImagePowerOfTwo ) {

					_gl.generateMipmap( _gl.TEXTURE_CUBE_MAP );

				}

				texture.needsUpdate = false;

				if ( texture.onUpdate ) texture.onUpdate( texture );

			} else {

				state.activeTexture( _gl.TEXTURE0 + slot );
				state.bindTexture( _gl.TEXTURE_CUBE_MAP, texture.image.__webglTextureCube );

			}

		}

	}

	function setCubeTextureDynamic ( texture, slot ) {

		state.activeTexture( _gl.TEXTURE0 + slot );
		state.bindTexture( _gl.TEXTURE_CUBE_MAP, texture.__webglTexture );

	}

	// Render targets

	function setupFrameBuffer ( framebuffer, renderTarget, textureTarget ) {

		_gl.bindFramebuffer( _gl.FRAMEBUFFER, framebuffer );
		_gl.framebufferTexture2D( _gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, textureTarget, renderTarget.__webglTexture, 0 );

	}

	function setupRenderBuffer ( renderbuffer, renderTarget ) {

		_gl.bindRenderbuffer( _gl.RENDERBUFFER, renderbuffer );

		if ( renderTarget.depthBuffer && ! renderTarget.stencilBuffer ) {

			_gl.renderbufferStorage( _gl.RENDERBUFFER, _gl.DEPTH_COMPONENT16, renderTarget.width, renderTarget.height );
			_gl.framebufferRenderbuffer( _gl.FRAMEBUFFER, _gl.DEPTH_ATTACHMENT, _gl.RENDERBUFFER, renderbuffer );

		/* For some reason this is not working. Defaulting to RGBA4.
		} else if ( ! renderTarget.depthBuffer && renderTarget.stencilBuffer ) {

			_gl.renderbufferStorage( _gl.RENDERBUFFER, _gl.STENCIL_INDEX8, renderTarget.width, renderTarget.height );
			_gl.framebufferRenderbuffer( _gl.FRAMEBUFFER, _gl.STENCIL_ATTACHMENT, _gl.RENDERBUFFER, renderbuffer );
		*/
		} else if ( renderTarget.depthBuffer && renderTarget.stencilBuffer ) {

			_gl.renderbufferStorage( _gl.RENDERBUFFER, _gl.DEPTH_STENCIL, renderTarget.width, renderTarget.height );
			_gl.framebufferRenderbuffer( _gl.FRAMEBUFFER, _gl.DEPTH_STENCIL_ATTACHMENT, _gl.RENDERBUFFER, renderbuffer );

		} else {

			_gl.renderbufferStorage( _gl.RENDERBUFFER, _gl.RGBA4, renderTarget.width, renderTarget.height );

		}

	}

	this.setRenderTarget = function ( renderTarget ) {

		var isCube = ( renderTarget instanceof THREE.WebGLRenderTargetCube );

		if ( renderTarget && renderTarget.__webglFramebuffer === undefined ) {

			if ( renderTarget.depthBuffer === undefined ) renderTarget.depthBuffer = true;
			if ( renderTarget.stencilBuffer === undefined ) renderTarget.stencilBuffer = true;

			renderTarget.addEventListener( 'dispose', onRenderTargetDispose );

			renderTarget.__webglTexture = _gl.createTexture();

			_this.info.memory.textures ++;

			// Setup texture, create render and frame buffers

			var isTargetPowerOfTwo = THREE.Math.isPowerOfTwo( renderTarget.width ) && THREE.Math.isPowerOfTwo( renderTarget.height ),
				glFormat = paramThreeToGL( renderTarget.format ),
				glType = paramThreeToGL( renderTarget.type );

			if ( isCube ) {

				renderTarget.__webglFramebuffer = [];
				renderTarget.__webglRenderbuffer = [];

				state.bindTexture( _gl.TEXTURE_CUBE_MAP, renderTarget.__webglTexture );

				setTextureParameters( _gl.TEXTURE_CUBE_MAP, renderTarget, isTargetPowerOfTwo );

				for ( var i = 0; i < 6; i ++ ) {

					renderTarget.__webglFramebuffer[ i ] = _gl.createFramebuffer();
					renderTarget.__webglRenderbuffer[ i ] = _gl.createRenderbuffer();

					_gl.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, glFormat, renderTarget.width, renderTarget.height, 0, glFormat, glType, null );

					setupFrameBuffer( renderTarget.__webglFramebuffer[ i ], renderTarget, _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i );
					setupRenderBuffer( renderTarget.__webglRenderbuffer[ i ], renderTarget );

				}

				if ( renderTarget.generateMipmaps && isTargetPowerOfTwo ) _gl.generateMipmap( _gl.TEXTURE_CUBE_MAP );

			} else {

				renderTarget.__webglFramebuffer = _gl.createFramebuffer();

				if ( renderTarget.shareDepthFrom ) {

					renderTarget.__webglRenderbuffer = renderTarget.shareDepthFrom.__webglRenderbuffer;

				} else {

					renderTarget.__webglRenderbuffer = _gl.createRenderbuffer();

				}

				state.bindTexture( _gl.TEXTURE_2D, renderTarget.__webglTexture );
				setTextureParameters( _gl.TEXTURE_2D, renderTarget, isTargetPowerOfTwo );

				_gl.texImage2D( _gl.TEXTURE_2D, 0, glFormat, renderTarget.width, renderTarget.height, 0, glFormat, glType, null );

				setupFrameBuffer( renderTarget.__webglFramebuffer, renderTarget, _gl.TEXTURE_2D );

				if ( renderTarget.shareDepthFrom ) {

					if ( renderTarget.depthBuffer && ! renderTarget.stencilBuffer ) {

						_gl.framebufferRenderbuffer( _gl.FRAMEBUFFER, _gl.DEPTH_ATTACHMENT, _gl.RENDERBUFFER, renderTarget.__webglRenderbuffer );

					} else if ( renderTarget.depthBuffer && renderTarget.stencilBuffer ) {

						_gl.framebufferRenderbuffer( _gl.FRAMEBUFFER, _gl.DEPTH_STENCIL_ATTACHMENT, _gl.RENDERBUFFER, renderTarget.__webglRenderbuffer );

					}

				} else {

					setupRenderBuffer( renderTarget.__webglRenderbuffer, renderTarget );

				}

				if ( renderTarget.generateMipmaps && isTargetPowerOfTwo ) _gl.generateMipmap( _gl.TEXTURE_2D );

			}

			// Release everything

			if ( isCube ) {

				state.bindTexture( _gl.TEXTURE_CUBE_MAP, null );

			} else {

				state.bindTexture( _gl.TEXTURE_2D, null );

			}

			_gl.bindRenderbuffer( _gl.RENDERBUFFER, null );
			_gl.bindFramebuffer( _gl.FRAMEBUFFER, null );

		}

		var framebuffer, width, height, vx, vy;

		if ( renderTarget ) {

			if ( isCube ) {

				framebuffer = renderTarget.__webglFramebuffer[ renderTarget.activeCubeFace ];

			} else {

				framebuffer = renderTarget.__webglFramebuffer;

			}

			width = renderTarget.width;
			height = renderTarget.height;

			vx = 0;
			vy = 0;

		} else {

			framebuffer = null;

			width = _viewportWidth;
			height = _viewportHeight;

			vx = _viewportX;
			vy = _viewportY;

		}

		if ( framebuffer !== _currentFramebuffer ) {

			_gl.bindFramebuffer( _gl.FRAMEBUFFER, framebuffer );
			_gl.viewport( vx, vy, width, height );

			_currentFramebuffer = framebuffer;

		}

		_currentWidth = width;
		_currentHeight = height;

	};

	this.readRenderTargetPixels = function( renderTarget, x, y, width, height, buffer ) {

		if ( ! ( renderTarget instanceof THREE.WebGLRenderTarget ) ) {

			console.error( 'THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.' );
			return;

		}

		if ( renderTarget.__webglFramebuffer ) {

			if ( renderTarget.format !== THREE.RGBAFormat ) {

				console.error( 'THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA format. readPixels can read only RGBA format.' );
				return;

			}

			var restore = false;

			if ( renderTarget.__webglFramebuffer !== _currentFramebuffer ) {

				_gl.bindFramebuffer( _gl.FRAMEBUFFER, renderTarget.__webglFramebuffer );

				restore = true;

			}

			if ( _gl.checkFramebufferStatus( _gl.FRAMEBUFFER ) === _gl.FRAMEBUFFER_COMPLETE ) {

				_gl.readPixels( x, y, width, height, _gl.RGBA, _gl.UNSIGNED_BYTE, buffer );

			} else {

				console.error( 'THREE.WebGLRenderer.readRenderTargetPixels: readPixels from renderTarget failed. Framebuffer not complete.' );

			}

			if ( restore ) {

				_gl.bindFramebuffer( _gl.FRAMEBUFFER, _currentFramebuffer );

			}

		}

	};

	function updateRenderTargetMipmap ( renderTarget ) {

		if ( renderTarget instanceof THREE.WebGLRenderTargetCube ) {

			state.bindTexture( _gl.TEXTURE_CUBE_MAP, renderTarget.__webglTexture );
			_gl.generateMipmap( _gl.TEXTURE_CUBE_MAP );
			state.bindTexture( _gl.TEXTURE_CUBE_MAP, null );

		} else {

			state.bindTexture( _gl.TEXTURE_2D, renderTarget.__webglTexture );
			_gl.generateMipmap( _gl.TEXTURE_2D );
			state.bindTexture( _gl.TEXTURE_2D, null );

		}

	}

	// Fallback filters for non-power-of-2 textures

	function filterFallback ( f ) {

		if ( f === THREE.NearestFilter || f === THREE.NearestMipMapNearestFilter || f === THREE.NearestMipMapLinearFilter ) {

			return _gl.NEAREST;

		}

		return _gl.LINEAR;

	}

	// Map three.js constants to WebGL constants

	function paramThreeToGL ( p ) {

		var extension;

		if ( p === THREE.RepeatWrapping ) return _gl.REPEAT;
		if ( p === THREE.ClampToEdgeWrapping ) return _gl.CLAMP_TO_EDGE;
		if ( p === THREE.MirroredRepeatWrapping ) return _gl.MIRRORED_REPEAT;

		if ( p === THREE.NearestFilter ) return _gl.NEAREST;
		if ( p === THREE.NearestMipMapNearestFilter ) return _gl.NEAREST_MIPMAP_NEAREST;
		if ( p === THREE.NearestMipMapLinearFilter ) return _gl.NEAREST_MIPMAP_LINEAR;

		if ( p === THREE.LinearFilter ) return _gl.LINEAR;
		if ( p === THREE.LinearMipMapNearestFilter ) return _gl.LINEAR_MIPMAP_NEAREST;
		if ( p === THREE.LinearMipMapLinearFilter ) return _gl.LINEAR_MIPMAP_LINEAR;

		if ( p === THREE.UnsignedByteType ) return _gl.UNSIGNED_BYTE;
		if ( p === THREE.UnsignedShort4444Type ) return _gl.UNSIGNED_SHORT_4_4_4_4;
		if ( p === THREE.UnsignedShort5551Type ) return _gl.UNSIGNED_SHORT_5_5_5_1;
		if ( p === THREE.UnsignedShort565Type ) return _gl.UNSIGNED_SHORT_5_6_5;

		if ( p === THREE.ByteType ) return _gl.BYTE;
		if ( p === THREE.ShortType ) return _gl.SHORT;
		if ( p === THREE.UnsignedShortType ) return _gl.UNSIGNED_SHORT;
		if ( p === THREE.IntType ) return _gl.INT;
		if ( p === THREE.UnsignedIntType ) return _gl.UNSIGNED_INT;
		if ( p === THREE.FloatType ) return _gl.FLOAT;

		extension = extensions.get( 'OES_texture_half_float' );

		if ( extension !== null ) {

			if ( p === THREE.HalfFloatType ) return extension.HALF_FLOAT_OES;

		}

		if ( p === THREE.AlphaFormat ) return _gl.ALPHA;
		if ( p === THREE.RGBFormat ) return _gl.RGB;
		if ( p === THREE.RGBAFormat ) return _gl.RGBA;
		if ( p === THREE.LuminanceFormat ) return _gl.LUMINANCE;
		if ( p === THREE.LuminanceAlphaFormat ) return _gl.LUMINANCE_ALPHA;

		if ( p === THREE.AddEquation ) return _gl.FUNC_ADD;
		if ( p === THREE.SubtractEquation ) return _gl.FUNC_SUBTRACT;
		if ( p === THREE.ReverseSubtractEquation ) return _gl.FUNC_REVERSE_SUBTRACT;

		if ( p === THREE.ZeroFactor ) return _gl.ZERO;
		if ( p === THREE.OneFactor ) return _gl.ONE;
		if ( p === THREE.SrcColorFactor ) return _gl.SRC_COLOR;
		if ( p === THREE.OneMinusSrcColorFactor ) return _gl.ONE_MINUS_SRC_COLOR;
		if ( p === THREE.SrcAlphaFactor ) return _gl.SRC_ALPHA;
		if ( p === THREE.OneMinusSrcAlphaFactor ) return _gl.ONE_MINUS_SRC_ALPHA;
		if ( p === THREE.DstAlphaFactor ) return _gl.DST_ALPHA;
		if ( p === THREE.OneMinusDstAlphaFactor ) return _gl.ONE_MINUS_DST_ALPHA;

		if ( p === THREE.DstColorFactor ) return _gl.DST_COLOR;
		if ( p === THREE.OneMinusDstColorFactor ) return _gl.ONE_MINUS_DST_COLOR;
		if ( p === THREE.SrcAlphaSaturateFactor ) return _gl.SRC_ALPHA_SATURATE;

		extension = extensions.get( 'WEBGL_compressed_texture_s3tc' );

		if ( extension !== null ) {

			if ( p === THREE.RGB_S3TC_DXT1_Format ) return extension.COMPRESSED_RGB_S3TC_DXT1_EXT;
			if ( p === THREE.RGBA_S3TC_DXT1_Format ) return extension.COMPRESSED_RGBA_S3TC_DXT1_EXT;
			if ( p === THREE.RGBA_S3TC_DXT3_Format ) return extension.COMPRESSED_RGBA_S3TC_DXT3_EXT;
			if ( p === THREE.RGBA_S3TC_DXT5_Format ) return extension.COMPRESSED_RGBA_S3TC_DXT5_EXT;

		}

		extension = extensions.get( 'WEBGL_compressed_texture_pvrtc' );

		if ( extension !== null ) {

			if ( p === THREE.RGB_PVRTC_4BPPV1_Format ) return extension.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;
			if ( p === THREE.RGB_PVRTC_2BPPV1_Format ) return extension.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;
			if ( p === THREE.RGBA_PVRTC_4BPPV1_Format ) return extension.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;
			if ( p === THREE.RGBA_PVRTC_2BPPV1_Format ) return extension.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG;

		}

		extension = extensions.get( 'EXT_blend_minmax' );

		if ( extension !== null ) {

			if ( p === THREE.MinEquation ) return extension.MIN_EXT;
			if ( p === THREE.MaxEquation ) return extension.MAX_EXT;

		}

		return 0;

	}

	// Allocations

	function allocateBones ( object ) {

		if ( _supportsBoneTextures && object && object.skeleton && object.skeleton.useVertexTexture ) {

			return 1024;

		} else {

			// default for when object is not specified
			// ( for example when prebuilding shader to be used with multiple objects )
			//
			//  - leave some extra space for other uniforms
			//  - limit here is ANGLE's 254 max uniform vectors
			//    (up to 54 should be safe)

			var nVertexUniforms = _gl.getParameter( _gl.MAX_VERTEX_UNIFORM_VECTORS );
			var nVertexMatrices = Math.floor( ( nVertexUniforms - 20 ) / 4 );

			var maxBones = nVertexMatrices;

			if ( object !== undefined && object instanceof THREE.SkinnedMesh ) {

				maxBones = Math.min( object.skeleton.bones.length, maxBones );

				if ( maxBones < object.skeleton.bones.length ) {

					console.warn( 'WebGLRenderer: too many bones - ' + object.skeleton.bones.length + ', this GPU supports just ' + maxBones + ' (try OpenGL instead of ANGLE)' );

				}

			}

			return maxBones;

		}

	}

	function allocateLights( lights ) {

		var dirLights = 0;
		var pointLights = 0;
		var spotLights = 0;
		var hemiLights = 0;

		for ( var l = 0, ll = lights.length; l < ll; l ++ ) {

			var light = lights[ l ];

			if ( light.onlyShadow || light.visible === false ) continue;

			if ( light instanceof THREE.DirectionalLight ) dirLights ++;
			if ( light instanceof THREE.PointLight ) pointLights ++;
			if ( light instanceof THREE.SpotLight ) spotLights ++;
			if ( light instanceof THREE.HemisphereLight ) hemiLights ++;

		}

		return { 'directional': dirLights, 'point': pointLights, 'spot': spotLights, 'hemi': hemiLights };

	}

	function allocateShadows( lights ) {

		var maxShadows = 0;

		for ( var l = 0, ll = lights.length; l < ll; l ++ ) {

			var light = lights[ l ];

			if ( ! light.castShadow ) continue;

			if ( light instanceof THREE.SpotLight ) maxShadows ++;
			if ( light instanceof THREE.DirectionalLight && ! light.shadowCascade ) maxShadows ++;

		}

		return maxShadows;

	}

	// DEPRECATED

	this.initMaterial = function () {

		console.warn( 'THREE.WebGLRenderer: .initMaterial() has been removed.' );

	};

	this.addPrePlugin = function () {

		console.warn( 'THREE.WebGLRenderer: .addPrePlugin() has been removed.' );

	};

	this.addPostPlugin = function () {

		console.warn( 'THREE.WebGLRenderer: .addPostPlugin() has been removed.' );

	};

	this.updateShadowMap = function () {

		console.warn( 'THREE.WebGLRenderer: .updateShadowMap() has been removed.' );

	};

	Object.defineProperties( this, {
		shadowMapEnabled: {
			get: function () {
				return shadowMap.enabled;
			},
			set: function ( value ) {
				console.warn( 'THREE.WebGLRenderer: .shadowMapEnabled is now .shadowMap.enabled.' );
				shadowMap.enabled = value;
			}
		},
		shadowMapType: {
			get: function () {
				return shadowMap.type;
			},
			set: function ( value ) {
				console.warn( 'THREE.WebGLRenderer: .shadowMapType is now .shadowMap.type.' );
				shadowMap.type = value;
			}
		},
		shadowMapCullFace: {
			get: function () {
				return shadowMap.cullFace;
			},
			set: function ( value ) {
				console.warn( 'THREE.WebGLRenderer: .shadowMapCullFace is now .shadowMap.cullFace.' );
				shadowMap.cullFace = value;
			}
		},
		shadowMapDebug: {
			get: function () {
				return shadowMap.debug;
			},
			set: function ( value ) {
				console.warn( 'THREE.WebGLRenderer: .shadowMapDebug is now .shadowMap.debug.' );
				shadowMap.debug = value;
			}
		},
		shadowMapCascade: {
			get: function () {
				return shadowMap.cascade;
			},
			set: function ( value ) {
				console.warn( 'THREE.WebGLRenderer: .shadowMapCascade is now .shadowMap.cascade.' );
				shadowMap.cascade = value;
			}
		}
	} );

};
